/**
 * Public employee link (/voucher/:id) and staff unlock — ports of worker_link_status,
 * open_worker_wallet, sign_worker_link, unlock_worker_link, unlock_voucher_link and the
 * _link_codes / _link_expired helpers (database/legacy_live_functions.sql).
 *
 * Anonymous access is token-scoped: the link id alone reveals only status/total/name;
 * after signing, or to the matching worker id + phone, the wallet lists the cards but hides every
 * code until the employee reveals it (reveal_worker_code). A revealed code stays revealed; an
 * unrevealed code never leaves the server.
 * Three failed identity attempts lock the link until its issuer or an admin unlocks it.
 */
import { Voucher, VoucherCode, WorkerLink, SignatureArchive } from "../models.js";
import { withTransaction } from "../db.js";
import { STATUS } from "../lib/canonical.js";
import { forbidden, unauthorized, HttpError } from "../errors.js";
import { cachedLink, forgetLink, rememberLink } from "../lib/linkStatusCache.js";

const MAX_ATTEMPTS = 3;
/** Only what each public read needs (lean, projected: these endpoints take the employee traffic). */
const STATUS_FIELDS = { _id: 0, total: 1, worker_id: 1, employee_name: 1, created_at: 1, created_on: 1, failed_attempts: 1, locked: 1 };
const WALLET_FIELDS = { _id: 0, id: 1, serials: 1, revealed_serials: 1, worker_id: 1, phone: 1, created_at: 1, created_on: 1, failed_attempts: 1, locked: 1 };
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

const isLocked = (l) => Boolean(l.locked) || Number(l.failed_attempts ?? 0) >= MAX_ATTEMPTS;

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

/**
 * Identity gate shared by the wallet and code reveal: null when the caller may proceed, otherwise
 * the failure to return. A wrong id/phone counts as a failed attempt (3 lock the link).
 */
async function workerGate(l, workerId, phone, session) {
  if (!l) return { ok: false, state: "invalid" };
  if (linkExpired(l)) return { ok: false, state: "expired" };
  if (isLocked(l)) return { ok: false, state: "locked" };
  // Unlike SQL's IS DISTINCT FROM, NULL never matches NULL: an unsigned link cannot be
  // opened with empty credentials (codes are only reachable by signing or by the signer).
  const matches = l.worker_id != null && l.phone != null && l.worker_id === workerId && l.phone === phone;
  if (!matches) {
    const n = Number(l.failed_attempts ?? 0) + 1;
    const set = { failed_attempts: n, locked: n >= MAX_ATTEMPTS };
    if (n >= MAX_ATTEMPTS) set.locked_at = new Date();
    await WorkerLink.updateOne({ id: l.id }, { $set: set }, { session });
    return { ok: false, state: n >= MAX_ATTEMPTS ? "locked" : "mismatch", attempts_left: Math.max(0, MAX_ATTEMPTS - n) };
  }
  if (Number(l.failed_attempts ?? 0) > 0) await WorkerLink.updateOne({ id: l.id }, { $set: { failed_attempts: 0 } }, { session });
  return null;
}

async function workerLinkStatus({ p_id }) {
  const id = text(p_id);
  if (id == null || !/^\d{4,12}$/.test(id)) return { exists: false };
  let l = cachedLink(id);
  if (!l) {
    const doc = await WorkerLink.findOne({ id }, STATUS_FIELDS).lean();
    if (!doc) return { exists: false }; // unknown ids are not cached: a new link must work at once
    // The national id only decides "signed"; it is not kept in memory.
    const { worker_id: workerId, ...rest } = doc;
    l = { ...rest, signed: workerId != null };
    rememberLink(id, l);
  }
  if (linkExpired(l)) return { exists: true, state: "expired" };
  if (isLocked(l)) return { exists: true, state: "locked" };
  return { exists: true, state: "ok", total: l.total, signed: l.signed, employee_name: l.employee_name ?? "" };
}

async function openWorkerWallet({ p_id, p_worker_id, p_phone }) {
  const id = text(p_id);
  if (id == null) return { ok: false, state: "invalid" };
  const workerId = text(p_worker_id);
  const phone = text(p_phone);
  // The usual visit (right person, nothing to update) is a plain read, without a transaction.
  const seen = await WorkerLink.findOne({ id }, WALLET_FIELDS).lean();
  if (seen && !linkExpired(seen) && !isLocked(seen) && !Number(seen.failed_attempts ?? 0)
    && seen.worker_id != null && seen.phone != null && seen.worker_id === workerId && seen.phone === phone) {
    return { ok: true, state: "ok", attempts_left: MAX_ATTEMPTS, codes: await walletCodes(seen) };
  }
  // Anything else may write (failed-attempt count, lock), so it goes through the full check.
  const result = await withTransaction(async (session) => {
    const l = await WorkerLink.findOne({ id }, WALLET_FIELDS).session(session).lean();
    const denied = await workerGate(l, workerId, phone, session);
    if (denied) return denied;
    return { ok: true, state: "ok", attempts_left: MAX_ATTEMPTS, codes: await walletCodes(l, session) };
  });
  forgetLink(id);
  return result;
}

/** Reveals one card of the link, permanently: the code is sent now and on every later visit. */
async function revealWorkerCode({ p_id, p_worker_id, p_phone, p_serial }) {
  const id = text(p_id);
  const serial = text(p_serial);
  if (id == null || serial == null) return { ok: false, state: "invalid" };
  const workerId = text(p_worker_id);
  const phone = text(p_phone);
  const result = await withTransaction(async (session) => {
    const l = await WorkerLink.findOne({ id }, WALLET_FIELDS).session(session).lean();
    const denied = await workerGate(l, workerId, phone, session);
    if (denied) return denied;
    if (!(l.serials ?? []).includes(serial)) return { ok: false, state: "invalid" };
    const [card] = await linkCodes([serial], session);
    if (!card) return { ok: false, state: "invalid" };
    await WorkerLink.updateOne({ id }, { $addToSet: { revealed_serials: serial } }, { session });
    return { ok: true, state: "ok", code: { ...card, revealed: true } };
  });
  forgetLink(id);
  return result;
}

async function signWorkerLink({ p_id, p_worker_id, p_phone, p_full_name, p_signature }) {
  const id = text(p_id);
  const workerId = text(p_worker_id);
  const phone = text(p_phone);
  const fullName = typeof p_full_name === "string" ? p_full_name.trim() : null;
  const signature = typeof p_signature === "string" ? p_signature : null;
  if (id == null || workerId == null || !/^\d{9}$/.test(workerId) || phone == null || !/^0\d{8,9}$/.test(phone)
    || fullName == null || fullName.length < 2
    || signature == null || !signature.startsWith("data:image/png;base64,") || signature.length > 800000) {
    return { ok: false };
  }
  const result = await withTransaction(async (session) => {
    const l = await WorkerLink.findOne({ id }).session(session).lean();
    if (!l || l.worker_id != null || linkExpired(l) || isLocked(l)) return { ok: false };
    const serials = (l.serials ?? []).filter((s) => typeof s === "string");
    await WorkerLink.updateOne({ id }, { $set: { worker_id: workerId, phone, signed_at: new Date().toISOString().slice(0, 10) } }, { session });
    await Voucher.updateMany({ serial: { $in: serials } }, {
      $set: { worker_id: workerId, worker_name: fullName, employee_id: workerId, employee_phone: phone, employee_name: fullName },
    }, { session });
    const sums = await Voucher.aggregate([
      { $match: { serial: { $in: serials } } },
      { $group: { _id: null, total: { $sum: "$amount" }, n: { $sum: 1 } } },
    ]).session(session);
    const total = sums[0]?.n ? sums[0].total : (l.total ?? 0);
    await SignatureArchive.create([{
      link_id: id, branch: l.branch ?? null, supervisor_id: l.supervisor_id ?? null, employee_name: fullName,
      employee_id_number: workerId, employee_phone: phone, total_amount: total,
      voucher_record_ids: l.serials ?? [], signature_image_url: signature,
    }], { session });
    return { ok: true, codes: await walletCodes({ ...l, serials }, session) };
  });
  // Again after commit: a status read during the transaction may have cached the old state.
  forgetLink(id);
  return result;
}

/** Admin, or the staff member who issued the link (worker_links.supervisor_id). */
function assertCanUnlock(user, owner) {
  if (user.role !== "admin" && (owner == null || String(owner) !== user.id)) {
    throw forbidden("רק מי שהפיק את השובר או אדמין יכולים לשחרר את הלינק");
  }
}

async function unlockWorkerLink({ p_id }, { user }) {
  if (!user) throw unauthorized("נדרשת התחברות");
  if (user.requires_password_change) throw forbidden("יש לעדכן סיסמה לפני הכניסה למערכת");
  const id = text(p_id);
  const l = id == null ? null : await WorkerLink.findOne({ id }, { supervisor_id: 1 }).lean();
  if (!l) throw new HttpError(404, "הלינק לא נמצא", "not_found");
  assertCanUnlock(user, l.supervisor_id);
  await WorkerLink.updateOne({ id }, { $set: { failed_attempts: 0, locked: false, locked_at: null } });
  return null;
}

async function unlockVoucherLink({ p_link_id }, { user }) {
  const id = text(p_link_id);
  const result = await withTransaction(async (session) => {
    const l = id == null ? null : await WorkerLink.findOne({ id }, { supervisor_id: 1, serials: 1 }).session(session).lean();
    if (!l) throw new HttpError(404, "הלינק לא נמצא", "not_found");
    assertCanUnlock(user, l.supervisor_id);
    await WorkerLink.updateOne({ id }, { $set: { failed_attempts: 0, locked: false, locked_at: null } }, { session });
    await Voucher.updateMany({ serial: { $in: (l.serials ?? []).filter((s) => typeof s === "string") } },
      { $set: { failed_attempts: 0, is_locked: false } }, { session });
    return true;
  });
  forgetLink(id);
  return result;
}

export default {
  worker_link_status: { auth: "public", handler: workerLinkStatus },
  open_worker_wallet: { auth: "public", handler: openWorkerWallet },
  reveal_worker_code: { auth: "public", handler: revealWorkerCode },
  sign_worker_link: { auth: "public", handler: signWorkerLink },
  // Public at the dispatcher only so the SQL's own 'נדרשת התחברות' message is preserved;
  // the handler enforces sign-in + password change itself.
  unlock_worker_link: { auth: "public", handler: unlockWorkerLink },
  unlock_voucher_link: { auth: "staff", handler: unlockVoucherLink },
};

