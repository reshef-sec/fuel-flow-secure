/**
 * Public employee link (/v/:token): the token is unguessable, but it alone reveals only
 * status, total and name. A 4-digit code sent by SMS opens the link once; that gives the device a
 * session, which signing and the wallet require. The wallet lists the cards but hides every code
 * until the employee reveals it; a revealed code stays revealed and an unrevealed one never leaves
 * the server.
 */
import jwt from "jsonwebtoken";
import { Voucher, VoucherCode, WorkerLink, SignatureArchive } from "../models.js";
import { withTransaction } from "../db.js";
import { STATUS } from "../lib/canonical.js";
import { badRequest, forbidden, unauthorized, HttpError } from "../errors.js";
import { normalizePhone } from "../auth.js";
import { inLearning } from "../lib/learningContext.js";
import { OTP_MAX_ATTEMPTS, otpHash, sendLinkCode } from "../lib/workerOtp.js";
import { cachedLink, forgetLink, rememberLink } from "../lib/linkStatusCache.js";

const RESEND_GAP_MS = 60 * 1000;
const SESSION_DAYS = 120;
const LINK_ID = /^[A-Za-z0-9_-]{4,40}$/;
/** Only what each public read needs (lean, projected: these endpoints take the employee traffic). */
const STATUS_FIELDS = { _id: 0, total: 1, signed_at: 1, phone: 1, employee_name: 1, created_at: 1, created_on: 1 };
const WALLET_FIELDS = { _id: 0, id: 1, serials: 1, revealed_serials: 1, signed_at: 1, created_at: 1, created_on: 1, otp_hash: 1, otp_attempts: 1 };

/** Proof that this device passed the code for this link. */
const workerSession = (id) => jwt.sign({ sub: id, kind: "worker" }, process.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d`, algorithm: "HS256" });
function validSession(token, id) {
  try {
    const p = jwt.verify(String(token ?? ""), process.env.JWT_SECRET, { algorithms: ["HS256"] });
    return p.kind === "worker" && p.sub === id;
  } catch {
    return false;
  }
}
/** Text parameter coercion: never pass caller objects into a query (NoSQL injection). */
const text = (v) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

/** timestamptz + interval 'n months' (UTC), clamping to month end like Postgres. */
export function addMonths(date, n) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** _link_expired: coalesce(created_at, created_on::timestamptz) + 3 months < now(). */
export function linkExpired(l, now = new Date()) {
  let base = l.created_at ? new Date(l.created_at) : null;
  if (!base && l.created_on) base = new Date(l.created_on);
  if (!base || Number.isNaN(base.getTime())) return false; // NULL comparison → not expired
  return addMonths(base, 3) < now;
}

/** _link_codes: card codes for the link's serials, never blocked cards, ordered by serial. */
export async function linkCodes(serials, session) {
  const list = (serials ?? []).filter((s) => typeof s === "string");
  if (!list.length) return [];
  const vouchers = await Voucher.find(
    { serial: { $in: list }, status: { $nin: [STATUS.BLOCKED, null] } },
    { _id: 0, serial: 1, real_code: 1, amount: 1, fuel_type: 1 },
  ).session(session ?? null).lean();
  const codes = await VoucherCode.find({ serial: { $in: vouchers.map((v) => v.serial) } }, { _id: 0, serial: 1, real_code: 1 })
    .session(session ?? null).lean();
  const bySerial = new Map(codes.map((c) => [c.serial, c]));
  return vouchers
    .sort((a, b) => (a.serial < b.serial ? -1 : a.serial > b.serial ? 1 : 0))
    .map((v) => {
      const c = bySerial.get(v.serial);
      return {
        serial: v.serial,
        real_code: c && c.real_code != null ? c.real_code : (v.real_code ?? null),
        amount: v.amount ?? null,
        fuel_type: v.fuel_type ?? "בנזין",
      };
    });
}

/** The wallet as the employee's phone receives it: a code only once that card was revealed. */
async function walletCodes(link, session) {
  const revealed = new Set(link.revealed_serials ?? []);
  return (await linkCodes(link.serials, session)).map((c) => (revealed.has(c.serial)
    ? { ...c, revealed: true }
    : { ...c, real_code: null, revealed: false }));
}

async function workerLinkStatus({ p_id }) {
  const id = text(p_id);
  if (id == null || !LINK_ID.test(id)) return { exists: false };
  let l = cachedLink(id);
  if (!l) {
    const doc = await WorkerLink.findOne({ id }, STATUS_FIELDS).lean();
    if (!doc) return { exists: false }; // unknown ids are not cached: a new link must work at once
    // The phone only decides whether a code can be sent; it is not kept in memory.
    const { phone, ...rest } = doc;
    l = { ...rest, reachable: Boolean(phone) };
    rememberLink(id, l);
  }
  if (linkExpired(l)) return { exists: true, state: "expired" };
  return { exists: true, state: "ok", total: l.total, signed: l.signed_at != null, employee_name: l.employee_name ?? "", reachable: l.reachable };
}

/** Checks the 4-digit code. Every attempt is counted before it is compared. */
async function verifyWorkerOtp({ p_id, p_code }) {
  const id = text(p_id);
  const code = text(p_code);
  if (id == null || code == null || !/^\d{4}$/.test(code)) return { ok: false, state: "wrong" };
  const l = await WorkerLink.findOneAndUpdate(
    { id, otp_hash: { $ne: null }, otp_attempts: { $lt: OTP_MAX_ATTEMPTS }, otp_expires_at: { $gt: new Date() } },
    { $inc: { otp_attempts: 1 } }, { new: true, projection: WALLET_FIELDS },
  ).lean();
  if (!l) return { ok: false, state: "new_code_needed" };
  if (linkExpired(l)) return { ok: false, state: "expired" };
  if (l.otp_hash !== otpHash(id, code)) {
    const left = Math.max(0, OTP_MAX_ATTEMPTS - l.otp_attempts);
    return { ok: false, state: left ? "wrong" : "new_code_needed", attempts_left: left };
  }
  // One use only. Demo links keep their published code.
  if (!inLearning()) await WorkerLink.updateOne({ id }, { $set: { otp_hash: null } });
  return { ok: true, session: workerSession(id), signed: l.signed_at != null };
}

/** Sends a fresh code to the phone on the link, for a new device or a lost message. */
async function requestWorkerOtp({ p_id }, { req }) {
  const id = text(p_id);
  const l = id == null ? null : await WorkerLink.findOne({ id }, { _id: 0, id: 1, phone: 1, employee_name: 1, otp_sent_at: 1, created_at: 1, created_on: 1 }).lean();
  if (!l || !l.phone || linkExpired(l)) return { ok: false, state: "unavailable" };
  if (l.otp_sent_at && Date.now() - new Date(l.otp_sent_at).getTime() < RESEND_GAP_MS) return { ok: false, state: "wait" };
  const r = await sendLinkCode(l, req);
  return r.sms_sent ? { ok: true } : { ok: false, state: "unavailable" };
}

async function openWorkerWallet({ p_id, p_session }) {
  const id = text(p_id);
  if (id == null || !validSession(p_session, id)) return { ok: false, state: "invalid" };
  const l = await WorkerLink.findOne({ id }, WALLET_FIELDS).lean();
  if (!l) return { ok: false, state: "invalid" };
  if (linkExpired(l)) return { ok: false, state: "expired" };
  return { ok: true, state: "ok", codes: await walletCodes(l) };
}

/** Reveals one card of the link, permanently: the code is sent now and on every later visit. */
async function revealWorkerCode({ p_id, p_session, p_serial }) {
  const id = text(p_id);
  const serial = text(p_serial);
  if (id == null || serial == null || !validSession(p_session, id)) return { ok: false, state: "invalid" };
  const l = await WorkerLink.findOne({ id }, WALLET_FIELDS).lean();
  if (!l) return { ok: false, state: "invalid" };
  if (linkExpired(l)) return { ok: false, state: "expired" };
  if (!(l.serials ?? []).includes(serial)) return { ok: false, state: "invalid" };
  const [card] = await linkCodes([serial]);
  if (!card) return { ok: false, state: "invalid" };
  await WorkerLink.updateOne({ id }, { $addToSet: { revealed_serials: serial } });
  return { ok: true, state: "ok", code: { ...card, revealed: true } };
}

/** The employee signs with a finger; name and phone come from the link the issuer created. */
async function signWorkerLink({ p_id, p_session, p_signature }) {
  const id = text(p_id);
  const signature = typeof p_signature === "string" ? p_signature : null;
  if (id == null || !validSession(p_session, id)
    || signature == null || !signature.startsWith("data:image/png;base64,") || signature.length > 800000) {
    return { ok: false };
  }
  const result = await withTransaction(async (session) => {
    const l = await WorkerLink.findOne({ id }).session(session).lean();
    if (!l || l.signed_at != null || linkExpired(l)) return { ok: false };
    const serials = (l.serials ?? []).filter((s) => typeof s === "string");
    await WorkerLink.updateOne({ id }, { $set: { signed_at: new Date().toISOString().slice(0, 10) } }, { session });
    await Voucher.updateMany({ serial: { $in: serials } }, {
      $set: { worker_name: l.employee_name, employee_name: l.employee_name, employee_phone: l.phone },
    }, { session });
    const sums = await Voucher.aggregate([
      { $match: { serial: { $in: serials } } },
      { $group: { _id: null, total: { $sum: "$amount" }, n: { $sum: 1 } } },
    ]).session(session);
    const total = sums[0]?.n ? sums[0].total : (l.total ?? 0);
    await SignatureArchive.create([{
      link_id: id, branch: l.branch ?? null, supervisor_id: l.supervisor_id ?? null, employee_name: l.employee_name,
      employee_phone: l.phone, total_amount: total,
      voucher_record_ids: l.serials ?? [], signature_image_url: signature,
    }], { session });
    return { ok: true, codes: await walletCodes({ ...l, serials }, session) };
  });
  // Again after commit: a status read during the transaction may have cached the old state.
  forgetLink(id);
  return result;
}

/** Issuer or admin: send a new code, optionally correcting the phone (also for links from before SMS). */
async function resendWorkerSms({ p_id, p_phone }, { user, req }) {
  if (!user) throw unauthorized("נדרשת התחברות");
  if (user.requires_password_change) throw forbidden("יש לעדכן סיסמה לפני הכניסה למערכת");
  const id = text(p_id);
  const l = id == null ? null : await WorkerLink.findOne({ id }, { _id: 0, id: 1, phone: 1, employee_name: 1, supervisor_id: 1 }).lean();
  if (!l) throw new HttpError(404, "הלינק לא נמצא", "not_found");
  if (user.role !== "admin" && (l.supervisor_id == null || String(l.supervisor_id) !== user.id)) {
    throw forbidden("רק מי שהפיק את השובר או אדמין יכולים לשלוח שוב");
  }
  const phone = p_phone == null ? l.phone : normalizePhone(p_phone);
  if (!/^05\d{8}$/.test(phone ?? "")) throw badRequest("מספר נייד לא תקין");
  if (phone !== l.phone) await WorkerLink.updateOne({ id }, { $set: { phone } });
  return sendLinkCode({ ...l, phone }, req);
}

export default {
  worker_link_status: { auth: "public", handler: workerLinkStatus },
  verify_worker_otp: { auth: "public", handler: verifyWorkerOtp },
  request_worker_otp: { auth: "public", handler: requestWorkerOtp },
  open_worker_wallet: { auth: "public", handler: openWorkerWallet },
  reveal_worker_code: { auth: "public", handler: revealWorkerCode },
  sign_worker_link: { auth: "public", handler: signWorkerLink },
  resend_worker_sms: { auth: "staff", handler: resendWorkerSms },
};
