/**
 * Inventory RPCs — ports of the live Postgres functions (database/legacy_live_functions.sql):
 *   get_central_inventory_snapshot, get_central_inventory_summary, central_inventory_counts,
 *   central_stock_available, transfer_voucher_stock, issue_voucher_to_worker,
 *   import_voucher_inventory, store_voucher_codes, reconcile_redeemed_vouchers.
 *
 * Concurrency: every allocation runs in one snapshot transaction (withTransaction) and claims
 * each card with a conditional findOneAndUpdate on "still available, no link/worker". Two
 * transactions racing for the same card produce a WriteConflict; the loser is retried from
 * scratch by the driver, re-reads the stock and either picks other cards or fails with the
 * SQL shortage message. A card can therefore never be allocated twice.
 */
import { Voucher, VoucherCode, WorkerLink, AppUser, Profile, InventoryLock } from "../models.js";
import { scopedLockId } from "../lib/learningContext.js";
import { withTransaction } from "../db.js";
import { badRequest, forbidden } from "../errors.js";
import { logAction } from "../lib/audit.js";
import {
  canonicalBranch, canonicalFuel, cardHolder, pazMatchKey, isValidDenomination,
  STATUS, MAIN_POOL, CENTRAL_LABEL,
} from "../lib/canonical.js";
import {
  requireActiveIssuanceClient, requireActivePrivateVehicle, setVoucherExpiry, addMonths,
} from "../lib/issuanceGuard.js";

const SHORTAGE = "אין מספיק מלאי זמין במאגר עבור סוג דלק וסכום זה";
const DENOMINATION = "בנזין בכפולות של 100 ₪ וסולר בכפולות של 50 ₪";
const ADMIN_REQUIRED = "Admin access required";
/** status IN ('טרם שומש', 'available') — legacy English statuses may exist in migrated data. */
const AVAILABLE_STATUSES = [STATUS.AVAILABLE, "available"];
const EMPTY = { $in: [null, ""] };
/** nullif(v.link_id,'') IS NULL AND nullif(v.worker_id,'') IS NULL AND nullif(v.worker_name,'') IS NULL */
const UNASSIGNED = { link_id: EMPTY, worker_id: EMPTY, worker_name: EMPTY };

const isAdmin = (u) => u?.role === "admin";
const requireAdmin = (u) => { if (!isAdmin(u)) throw forbidden(ADMIN_REQUIRED); };
const blank = (v) => v == null || v === "";
/** jsonb ->> : null for missing / JSON null, text otherwise. */
const txt = (obj, k) => {
  const v = obj && typeof obj === "object" && !Array.isArray(obj) ? obj[k] : undefined;
  if (v == null) return null;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
};
/** Postgres trim()/btrim() without a character list strips spaces only. */
const sqlTrim = (v) => String(v ?? "").replace(/^ +| +$/g, "");
const ilDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });
/** to_char(ts AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD') */
const ilDay = (d) => ilDayFmt.format(d);

/** (item->>'amount')::integer — null when absent, NaN when not an integer. */
function intParam(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) ? n : NaN;
}

/** trim(concat_ws(' ', u.last_name, u.first_name)) from app_users joined on national_id. */
async function staffName(nationalId, session) {
  const u = nationalId ? await AppUser.findOne({ national_id: nationalId }, { last_name: 1, first_name: 1 }).session(session ?? null).lean() : null;
  if (!u) return "";
  return [u.last_name, u.first_name].filter((x) => x != null).join(" ").trim();
}

function roleFlags(user) {
  return { admin: user.role === "admin", branch: user.role === "branch", sup: user.role === "supervisor" };
}

/** Serialises imports/reconciliation (SQL: LOCK TABLE public.vouchers IN SHARE ROW EXCLUSIVE MODE). */
async function lockVouchers(session) {
  await InventoryLock.updateOne({ _id: scopedLockId("vouchers") }, { $inc: { n: 1 } }, { session, upsert: true });
}
async function ensureLockDoc() {
  try {
    await InventoryLock.updateOne({ _id: scopedLockId("vouchers") }, { $setOnInsert: { n: 0 } }, { upsert: true });
  } catch (e) {
    if (e?.code !== 11000) throw e;
  }
}

// ───────────────────────────── central inventory ─────────────────────────────

const SNAPSHOT_BLANK_KEYS = ["supervisor", "supervisor_id", "link_id", "worker_id", "worker_name", "employee_id", "employee_name"];
const DIESEL_EXACT = new Set(["סולר", "דיזל", "diesel", "solar"]);

async function centralSnapshot() {
  const rows = await Voucher.find(
    { status: { $in: AVAILABLE_STATUSES }, branch: { $regex: /^ *(מאגר מרכזי|מאגר ראשי) *$/ } },
    { amount: 1, fuel_type: 1, ...Object.fromEntries(SNAPSHOT_BLANK_KEYS.map((k) => [k, 1])) },
  ).lean();
  let total = 0, gasoline = 0, diesel = 0;
  const groups = new Map();
  for (const r of rows) {
    // NOT EXISTS (... nullif(btrim(r->>k),'') IS NOT NULL)
    if (SNAPSHOT_BLANK_KEYS.some((k) => r[k] != null && sqlTrim(r[k]) !== "")) continue;
    const amount = r.amount == null || r.amount === "" ? 0 : Number(r.amount);
    const fuel = DIESEL_EXACT.has(sqlTrim(r.fuel_type).toLowerCase()) ? "סולר" : "בנזין";
    total += amount;
    if (fuel === "סולר") diesel += amount; else gasoline += amount;
    const key = `${amount}|${fuel}`;
    const g = groups.get(key) ?? { amount, fuel_type: fuel, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  const denominations = [...groups.values()].sort((a, b) => a.amount - b.amount || (a.fuel_type < b.fuel_type ? -1 : a.fuel_type > b.fuel_type ? 1 : 0));
  return { total_available_amount: total, gasoline_amount: gasoline, diesel_amount: diesel, denominations };
}

/** Rows that central_inventory_counts / central_stock_available count (exact SQL filter). */
const CENTRAL_STRICT = { branch: MAIN_POOL, supervisor: null, status: STATUS.AVAILABLE };

// ───────────────────────────── issuance / transfer ─────────────────────────────

const SAFE_PROJECTION = { _id: 0, serial: 1, card_number: 1, amount: 1, fuel_type: 1, link_id: 1, status: 1, issued_at: 1, expires_at: 1 };
const FUEL_RE = /(סולר|דיזל|diesel|solar)/i;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Coarse index-friendly prefilter; the exact canonical_* rules are re-checked in JS. */
function branchPrefilter(canon) {
  if (canon === CENTRAL_LABEL) {
    return { $or: [{ branch: null }, { branch: { $regex: /^\s*(סניף\s+)?(מאגר (ראשי|מרכזי))?\s*(\(.*)?$/ } }] };
  }
  return { branch: { $regex: escapeRe(canon) } };
}

/** Claims one card: succeeds only if it is still unallocated stock. */
async function claimCard(serial, set, session) {
  return Voucher.findOneAndUpdate(
    { serial, status: { $in: AVAILABLE_STATUSES }, ...UNASSIGNED },
    { $set: set },
    { session, new: true, projection: SAFE_PROJECTION },
  ).lean();
}

/** Trigger emulation for a voucher whose link_id is being assigned. */
async function guardIssuance(row, session) {
  const prev = { link_id: null };
  await requireActiveIssuanceClient(row, prev, session);
  await requireActivePrivateVehicle(row, prev, session);
}
/** set_voucher_expiry applied to one card's merged row; returns trigger-assigned columns. */
function expiryPatch(card, set) {
  const merged = { ...card, ...set };
  const next = setVoucherExpiry({ ...merged });
  const patch = {};
  for (const k of ["status", "issued_at", "expires_at"]) if (next[k] !== merged[k]) patch[k] = next[k];
  return patch;
}

function validateLink(p_link) {
  const id = txt(p_link, "id");
  const name = sqlTrim(txt(p_link, "employee_name") ?? "");
  if (id == null || !/^\d{4,12}$/.test(id) || name.length < 2) throw badRequest("פרטי לינק לא תקינים");
  return { id, name };
}

async function issueVoucherToWorker(params, { user }) {
  const { p_items, p_branch = null, p_supervisor = null, p_link = null } = params;
  const role = roleFlags(user);
  if (!(role.admin || role.branch || role.sup)) throw forbidden("אין הרשאה");
  const callerBranch = user.branch ?? null;
  const callerName = await staffName(user.national_id);
  if (!role.admin && canonicalBranch(p_branch) !== canonicalBranch(callerBranch)) throw forbidden("אין הרשאה לסניף זה");
  const link = validateLink(p_link);
  if (!Array.isArray(p_items) || p_items.length === 0) throw badRequest("יש לבחור שוברים");

  const callerCanon = canonicalBranch(callerBranch);
  const inScope = (v) => {
    const canon = canonicalBranch(v.branch);
    const holder = cardHolder(v.supervisor, v.branch);
    if (role.admin) return canon === CENTRAL_LABEL && holder == null;
    if (role.branch) return canon === callerCanon && canon !== CENTRAL_LABEL && holder == null;
    return canon === callerCanon && (v.supervisor_id === user.id || (holder != null && holder === callerName));
  };
  const scopeCanon = role.admin ? CENTRAL_LABEL : callerCanon;

  return withTransaction(async (session) => {
    const stamp = new Date();
    const day = ilDay(stamp);
    const expires = addMonths(stamp, 3);
    const result = [];
    const allIds = [];
    let totalAmount = 0;
    let linkTotal = 0;

    for (let idx = 0; idx < p_items.length; idx += 1) {
      const item = p_items[idx];
      const want = intParam(txt(item, "amount"));
      const fuel = canonicalFuel(txt(item, "fuel_type"));
      if (want == null || !isValidDenomination(fuel, want)) throw badRequest(DENOMINATION);

      // Largest denominations first; exact value per card (ORDER BY amount DESC, serial).
      const fuelFilter = fuel === "סולר" ? { fuel_type: { $regex: FUEL_RE } } : { fuel_type: { $not: FUEL_RE } };
      const query = {
        status: { $in: AVAILABLE_STATUSES }, ...UNASSIGNED,
        amount: { $gt: 0, $lte: want }, serial: { $nin: allIds },
        $and: [fuelFilter, branchPrefilter(scopeCanon)],
      };
      const picked = [];
      let got = 0;
      const cursor = Voucher.find(query, { serial: 1, amount: 1, fuel_type: 1, branch: 1, supervisor: 1, supervisor_id: 1, requester: 1, status: 1, issued_at: 1, expires_at: 1, link_id: 1 })
        .sort({ amount: -1, serial: 1 }).session(session).lean().cursor();
      try {
        for await (const c of cursor) {
          if (got === want) break;
          if (canonicalFuel(c.fuel_type) !== fuel || !inScope(c)) continue;
          if (got + c.amount <= want) { got += c.amount; picked.push(c); }
        }
      } finally {
        await cursor.close();
      }
      if (got !== want) throw badRequest(SHORTAGE);

      const d = item && typeof item === "object" && item.details && typeof item.details === "object" ? item.details : {};
      const base = {
        branch: p_branch, supervisor: p_supervisor, supervisor_id: user.id,
        status: STATUS.ISSUED, fuel_type: fuel,
        client: txt(d, "client"), client_id: txt(d, "client_id"), client_code: txt(d, "client_code"),
        account_name: txt(d, "account_name"), standard: txt(d, "standard"), site_id: txt(d, "site_id"), site_name: txt(d, "site_name"),
        reason: txt(d, "reason"), issue_reason: txt(d, "reason"), route: txt(d, "route"),
        worker_name: link.name, employee_name: link.name, link_id: link.id,
        updated_on: day, delivered_at: day, issued_at: stamp, expires_at: expires,
      };
      // BEFORE UPDATE OF link_id triggers (identical for every card of this item).
      await guardIssuance(base, session);

      const rows = [];
      for (const c of picked) {
        const set = { ...base, requester: txt(d, "requester") ?? c.requester ?? null };
        Object.assign(set, expiryPatch(c, set));
        const r = await claimCard(c.serial, set, session);
        if (!r) throw badRequest(SHORTAGE); // no inventory, no issuance
        linkTotal += Number(r.amount);
        rows.push({
          serial: r.serial, card_number: r.card_number ?? r.serial, amount: r.amount, fuel_type: r.fuel_type,
          item_index: idx, link_id: r.link_id, status: r.status, issued_at: r.issued_at, expires_at: r.expires_at,
        });
      }
      rows.sort((a, b) => (a.serial < b.serial ? -1 : a.serial > b.serial ? 1 : 0));
      result.push(...rows);
      allIds.push(...picked.map((c) => c.serial));
      totalAmount += want;
    }

    await WorkerLink.create([{
      id: link.id, total: linkTotal, serials: allIds, created_on: day,
      employee_name: link.name, branch: p_branch, supervisor_id: user.id,
    }], { session });
    return { link_id: link.id, total: totalAmount, vouchers: result };
  });
}

async function transferVoucherStock(params, { user }) {
  const { p_items, p_branch = null, p_supervisor = null, p_link = null } = params;
  const role = roleFlags(user);
  if (!(role.admin || role.branch || role.sup)) throw forbidden("אין הרשאה");
  const callerBranch = user.branch ?? null;
  const callerName = await staffName(user.national_id);
  if (p_branch == null || sqlTrim(p_branch).length === 0) throw badRequest("יש לבחור סניף");
  if (!role.admin && p_branch !== callerBranch) throw forbidden("אין הרשאה לסניף זה");
  if (p_link == null && role.sup) throw forbidden("אין הרשאה להקצאה");
  if (!Array.isArray(p_items) || p_items.length === 0) throw badRequest("יש לבחור שוברים");

  let targetId = null;
  if (p_supervisor != null) {
    const sups = await Profile.find({ branch: p_branch, role: "supervisor" }, { id: 1, national_id: 1 }).sort({ _id: 1 }).lean();
    for (const s of sups) {
      if ((await staffName(s.national_id)) === p_supervisor) { targetId = s.id; break; }
    }
    if (targetId == null) throw badRequest("המפקח אינו משויך לסניף");
    if (p_link != null && !role.admin && !role.branch && targetId !== user.id) throw forbidden("אין הרשאה למפקח זה");
  }
  const link = p_link != null ? validateLink(p_link) : null;

  const items = [];
  const ids = [];
  for (const item of p_items) {
    const requested = intParam(txt(item, "amount"));
    const fuel = txt(item, "fuel_type");
    if ((fuel !== "בנזין" && fuel !== "סולר") || requested == null || Number.isNaN(requested) || requested <= 0
      || (fuel === "בנזין" && requested % 100 !== 0) || (fuel === "סולר" && requested % 50 !== 0)) {
      throw badRequest(DENOMINATION);
    }
    const raw = item && typeof item === "object" ? item.serials : null;
    const serials = Array.isArray(raw) ? raw.map((s) => (s != null && typeof s === "object" ? JSON.stringify(s) : String(s))) : [];
    if (serials.length === 0) throw badRequest(SHORTAGE);
    items.push({ requested, fuel, serials, details: item.details && typeof item.details === "object" ? item.details : {} });
    ids.push(...[...serials].sort());
  }
  if (new Set(ids).size !== ids.length) throw badRequest("כרטיס נבחר יותר מפעם אחת");

  await withTransaction(async (session) => {
    const stamp = new Date();
    const day = ilDay(stamp);
    const expires = addMonths(stamp, 3);
    const cards = new Map(
      (await Voucher.find({ serial: { $in: ids } }).session(session).lean()).map((c) => [c.serial, c]),
    );
    // Verify every card before any write (SQL: lock all, then check item by item).
    const plan = [];
    for (const it of items) {
      let actual = 0;
      for (const id of it.serials) {
        const card = cards.get(id);
        if (!card) throw badRequest(SHORTAGE);
        if (!AVAILABLE_STATUSES.includes(card.status) || (card.fuel_type ?? "בנזין") !== it.fuel
          || !blank(card.link_id) || !blank(card.worker_id) || !blank(card.worker_name)) throw badRequest(SHORTAGE);
        if (role.admin) {
          if ((card.branch != null && card.branch !== MAIN_POOL) || !blank(card.supervisor)) throw badRequest(SHORTAGE);
        } else {
          if (card.branch !== callerBranch) throw forbidden("אין הרשאה למלאי זה");
          if (role.branch && !blank(card.supervisor)) throw badRequest("המלאי כבר הוקצה למפקח");
          if (!role.branch && (card.supervisor_id ?? null) !== user.id
            && !(card.supervisor_id == null && callerName !== "" && card.supervisor === callerName)) {
            throw forbidden("אין הרשאה למלאי זה");
          }
        }
        actual += Number(card.amount);
      }
      if (actual !== it.requested) throw badRequest(SHORTAGE);
      plan.push(it);
    }

    let linkTotal = 0;
    for (const it of plan) {
      const d = it.details;
      const linked = link != null;
      const common = {
        branch: p_branch, supervisor: p_supervisor,
        supervisor_id: linked ? user.id : targetId,
        updated_on: day,
      };
      if (linked) {
        Object.assign(common, {
          status: STATUS.ISSUED,
          client: txt(d, "client"), client_id: txt(d, "client_id"), client_code: txt(d, "client_code"),
          account_name: txt(d, "account_name"), standard: txt(d, "standard"), site_id: txt(d, "site_id"), site_name: txt(d, "site_name"),
          reason: txt(d, "reason"), issue_reason: txt(d, "reason"), route: txt(d, "route"),
          worker_name: link.name, employee_name: link.name, link_id: link.id,
          delivered_at: day, issued_at: stamp, expires_at: expires,
        });
        await guardIssuance(common, session);
      }
      for (const id of it.serials) {
        const card = cards.get(id);
        const set = {
          ...common,
          requester: txt(d, "requester") ?? card.requester ?? null,
          approver: txt(d, "approver") ?? card.approver ?? null,
        };
        Object.assign(set, expiryPatch(card, set));
        const r = await claimCard(id, set, session);
        if (!r) throw badRequest(SHORTAGE);
        linkTotal += Number(r.amount);
      }
    }
    if (link != null) {
      await WorkerLink.create([{
        id: link.id, total: linkTotal, serials: ids, created_on: day,
        employee_name: link.name, branch: p_branch, supervisor_id: user.id,
      }], { session });
    }
  });
  return null;
}

// ───────────────────────────── import / codes ─────────────────────────────

async function importVoucherInventory({ p_rows }, { user }) {
  requireAdmin(user);
  if (!Array.isArray(p_rows) || p_rows.length === 0 || p_rows.length > 5000) throw badRequest("Invalid stock file");
  await ensureLockDoc();
  return withTransaction(async (session) => {
    await lockVouchers(session);
    const day = ilDay(new Date());
    const rows = p_rows.map((r) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) throw badRequest("Invalid stock row");
      return r;
    });
    const wanted = [...new Set(rows.map((r) => sqlTrim(txt(r, "serial") ?? "")).filter(Boolean))];
    // Never upsert/overwrite: any existing card (by serial or card number) or code is skipped.
    const taken = new Set();
    for (const v of await Voucher.find({ $or: [{ serial: { $in: wanted } }, { card_number: { $in: wanted } }] }, { serial: 1, card_number: 1 }).session(session).lean()) {
      taken.add(v.serial); if (v.card_number) taken.add(v.card_number);
    }
    for (const c of await VoucherCode.find({ $or: [{ serial: { $in: wanted } }, { card_number: { $in: wanted } }] }, { serial: 1, card_number: 1 }).session(session).lean()) {
      taken.add(c.serial); if (c.card_number) taken.add(c.card_number);
    }
    let added = 0, skipped = 0;
    const ids = [];
    const vouchers = [];
    const codes = [];
    for (const r of rows) {
      const serialRaw = txt(r, "serial");
      if (serialRaw == null || sqlTrim(serialRaw) === "") throw badRequest("Card number required");
      const serial = sqlTrim(serialRaw);
      if (taken.has(serial)) { skipped += 1; continue; }
      const realCode = txt(r, "real_code");
      const amount = intParam(txt(r, "amount"));
      const fuel = txt(r, "fuel_type");
      if (realCode == null || sqlTrim(realCode) === "" || amount == null || Number.isNaN(amount) || amount <= 0
        || amount % 50 !== 0 || fuel == null || (fuel !== "בנזין" && fuel !== "סולר")) {
        throw badRequest("Invalid stock row");
      }
      vouchers.push({ serial, card_number: serial, real_code: "", amount, fuel_type: fuel, branch: MAIN_POOL, status: STATUS.AVAILABLE, updated_on: day });
      const code = sqlTrim(realCode);
      codes.push({ serial, card_number: serial, real_code: code, redemption_code: code });
      taken.add(serial);
      added += 1;
      ids.push(serial);
    }
    if (vouchers.length) {
      await Voucher.insertMany(vouchers, { session });
      await VoucherCode.insertMany(codes, { session });
    }
    await logAction(user, "ייבוא מלאי שוברים", `${added} נוספו, ${skipped} כפולים דולגו`, { added, skipped }, session);
    return { added, skipped, serials: ids };
  });
}

async function storeVoucherCodes({ p_codes }, { user }) {
  requireAdmin(user);
  if (!Array.isArray(p_codes)) throw badRequest("Expected array of voucher codes");
  const rows = p_codes.map((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) throw badRequest("Expected array of voucher codes");
    return { serial: txt(x, "serial"), real_code: txt(x, "real_code") };
  });
  if (rows.some((x) => sqlTrim(x.serial ?? "") === "" || sqlTrim(x.real_code ?? "") === "")) {
    throw badRequest("Card number and code are required");
  }
  if (new Set(rows.map((x) => x.serial)).size !== rows.length) {
    throw badRequest("ON CONFLICT DO UPDATE command cannot affect row a second time");
  }
  await withTransaction(async (session) => {
    const serials = rows.map((x) => x.serial);
    const existing = new Set((await Voucher.find({ serial: { $in: serials } }, { serial: 1 }).session(session).lean()).map((v) => v.serial));
    if (rows.some((x) => !existing.has(x.serial))) throw badRequest("Voucher does not exist");
    // SQL: INSERT ... ON CONFLICT (serial) DO UPDATE SET real_code (+ redemption_code alias sync).
    // Only the confidential code row is written; the physical card is never touched.
    if (rows.length) {
      await VoucherCode.bulkWrite(rows.map((x) => ({
        updateOne: {
          filter: { serial: x.serial },
          update: { $set: { real_code: x.real_code, redemption_code: x.real_code }, $setOnInsert: { card_number: x.serial } },
          upsert: true,
        },
      })), { session, ordered: true });
    }
  });
  return null;
}

// ───────────────────────────── Paz reconciliation ─────────────────────────────

const AMBIGUOUS = "נמצאו מספרי כרטיסים דו־משמעיים לאחר הסרת אפסים מובילים; יש לבדוק את המלאי לפני הייבוא";
/**
 * Eligible for final redemption. SQL stored 'redeemed' and re-matched only 'redeemed' rows with a
 * NULL redeemed_at; this port stores 'מומש סופית', so a final-status row is re-matched only while its
 * redeemed_at is still NULL — repeat imports therefore count 0, exactly like the SQL.
 */
const ELIGIBLE = {
  $or: [
    { status: { $in: ["available", "issued", STATUS.AVAILABLE, STATUS.ISSUED, "מומש בפועל"] } },
    { status: { $in: ["redeemed", STATUS.REDEEMED] }, redeemed_at: null },
  ],
};

async function reconcileRedeemedVouchers({ card_numbers }, { user }) {
  requireAdmin(user);
  const keys = [...new Set((Array.isArray(card_numbers) ? card_numbers : [])
    .map((x) => (x == null ? null : pazMatchKey(typeof x === "object" ? JSON.stringify(x) : x)))
    .filter((k) => k != null && k !== ""))];
  if (keys.length === 0) throw badRequest("Card numbers required");
  await ensureLockDoc();

  return withTransaction(async (session) => {
    await lockVouchers(session);
    // Maintain the match key for rows written before it existed (migrated data).
    const missing = await Voucher.find({ paz_match_key: null }, { serial: 1, card_number: 1 }).session(session).lean();
    if (missing.length) {
      await Voucher.bulkWrite(missing.map((v) => ({
        updateOne: { filter: { _id: v._id }, update: { $set: { paz_match_key: pazMatchKey(v.card_number ?? v.serial) } } },
      })), { session });
    }
    const matches = await Voucher.find({ paz_match_key: { $in: keys } }, { serial: 1, card_number: 1, paz_match_key: 1 }).session(session).lean();
    const perKey = new Map();
    for (const m of matches) perKey.set(m.paz_match_key, (perKey.get(m.paz_match_key) ?? 0) + 1);
    if ([...perKey.values()].some((n) => n > 1)) throw badRequest(AMBIGUOUS);

    const now = new Date();
    const eligible = await Voucher.find({ paz_match_key: { $in: keys }, ...ELIGIBLE }, { serial: 1, card_number: 1 }).session(session).lean();
    let n = 0;
    if (eligible.length) {
      const res = await Voucher.updateMany(
        { _id: { $in: eligible.map((v) => v._id) }, ...ELIGIBLE },
        [{ $set: { status: STATUS.REDEEMED, redeemed_at: { $ifNull: ["$redeemed_at", now] }, updated_on: ilDay(now) } }],
        { session },
      );
      n = res.matchedCount;
    }
    const changed = eligible.map((v) => v.card_number ?? v.serial).sort();
    // Same transaction as the redemption: an audit failure rolls the update back.
    await logAction(user, "היזון חוזר מימושים מפז",
      `${n} שוברים עודכנו למומש סופית · מספרי כרטיסים: ${changed.length ? changed.join(", ") : "ללא"}`,
      { count: n, card_numbers: changed }, session);
    return n;
  });
}

export default {
  get_central_inventory_snapshot: {
    auth: "staff",
    handler: async (_p, { user }) => { requireAdmin(user); return centralSnapshot(); },
  },
  /** RETURNS TABLE → PostgREST array of one row. */
  get_central_inventory_summary: {
    auth: "staff",
    handler: async (_p, { user }) => {
      requireAdmin(user);
      const s = await centralSnapshot();
      return [{ total_available_amount: s.total_available_amount, gasoline_amount: s.gasoline_amount, diesel_amount: s.diesel_amount }];
    },
  },
  /** Non-admins get an empty set (the SQL WHERE has_role(...) filters every row). */
  central_inventory_counts: {
    auth: "staff",
    handler: async (_p, { user }) => {
      if (!isAdmin(user)) return [];
      const rows = await Voucher.aggregate([
        { $match: CENTRAL_STRICT },
        { $group: { _id: { fuel_type: "$fuel_type", amount: "$amount" }, cards: { $sum: 1 }, total: { $sum: "$amount" } } },
        { $project: { _id: 0, fuel_type: "$_id.fuel_type", amount: "$_id.amount", cards: 1, total: 1 } },
        { $sort: { fuel_type: 1, amount: 1 } },
      ]);
      return rows.map((r) => ({ fuel_type: r.fuel_type, amount: r.amount, cards: r.cards, total: r.total }));
    },
  },
  central_stock_available: {
    auth: "staff",
    handler: async ({ _fuel }, { user }) => {
      if (!isAdmin(user) || _fuel == null) return 0;
      const [r] = await Voucher.aggregate([
        { $match: { ...CENTRAL_STRICT, fuel_type: _fuel ?? null } },
        { $group: { _id: null, s: { $sum: "$amount" } } },
      ]);
      return Math.trunc(r?.s ?? 0);
    },
  },
  transfer_voucher_stock: { auth: "staff", handler: transferVoucherStock },
  issue_voucher_to_worker: { auth: "staff", handler: issueVoucherToWorker },
  import_voucher_inventory: { auth: "staff", handler: importVoucherInventory },
  store_voucher_codes: { auth: "staff", handler: storeVoucherCodes },
  reconcile_redeemed_vouchers: { auth: "staff", handler: reconcileRedeemedVouchers },
};
