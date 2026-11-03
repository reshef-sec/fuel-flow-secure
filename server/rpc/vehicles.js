/**
 * Vehicle snapshot imports — ports of sync_work_vehicles, sync_private_vehicles and the
 * legacy sync_vehicle_pool (database/legacy_live_functions.sql, work_vehicle_sync.sql,
 * private_vehicle_sync.sql).
 *
 * Delta sync rules (unchanged from SQL):
 *   - Work-vehicle identity = btrim(standard) + btrim(client_code); private = client_id + site_id.
 *   - Rows in the upload are upserted with is_active = true (reactivation).
 *   - Rows in the DB but missing from the upload become is_active = false. Nothing is deleted.
 *   - Blank rows are skipped; first row wins on duplicate identities.
 *   - Zero valid rows fails BEFORE any write (no accidental mass deactivation).
 *   - Everything — including the audit entry — commits in one transaction.
 */
import mongoose from "mongoose";
import { B2BClient, RegularClient } from "../models.js";
import { withTransaction } from "../db.js";
import { logAction } from "../lib/audit.js";
import { badRequest, forbidden } from "../errors.js";

/** jsonb ->> / jsonb_each_text semantics: null stays null, objects keep their JSON text. */
const txt = (v) => (v == null ? null : typeof v === "object" ? JSON.stringify(v) : String(v));
/** nullif(btrim(x->>'k'), '') */
const key = (v) => {
  const t = txt(v);
  if (t == null) return null;
  const s = t.trim();
  return s === "" ? null : s;
};
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** True when at least one field has a non-blank text value (jsonb_each_text check). */
const hasValue = (row) => Object.values(row).some((v) => key(v) != null);
const isActive = (doc) => doc.is_active !== false;
const idKey = (a, b) => JSON.stringify([a, b]);
const docKey = (a, b) => (a == null || b == null ? null : idKey(String(a).trim(), String(b).trim()));

function requireAdmin(user) {
  if (!user || user.role !== "admin") throw forbidden("Admin access required");
}

/**
 * Emulates `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE`: every sync of the same pool
 * writes the same lock document inside its transaction, so concurrent syncs conflict
 * and the driver retries them one after another.
 */
async function prepareLock(name) {
  await mongoose.connection.collection("rpc_locks").updateOne(
    { _id: name }, { $setOnInsert: { n: 0 } }, { upsert: true },
  );
}
async function takeLock(name, session) {
  await mongoose.connection.collection("rpc_locks").updateOne(
    { _id: name }, { $inc: { n: 1 }, $set: { at: new Date() } }, { session },
  );
}

/** Splits rows into blanks / invalid / first-row-deduplicated cleaned rows. */
function cleanRows(rows, aField, bField) {
  let blanks = 0;
  let invalid = 0;
  const cleaned = [];
  const seen = new Set();
  for (const row of rows) {
    const nonBlank = hasValue(row);
    if (!nonBlank) blanks += 1;
    const a = key(row[aField]);
    const b = key(row[bField]);
    if (a == null || b == null) {
      if (nonBlank) invalid += 1;
      continue;
    }
    const k = idKey(a, b);
    if (seen.has(k)) continue;
    seen.add(k);
    cleaned.push({ ...row, [aField]: a, [bField]: b, _key: k });
  }
  return { blanks, invalid, cleaned };
}

const B2B_TEXT = ["balance", "load_type", "budget_section", "account_key", "item_family", "account_status", "account_type"];
const workFields = (x) => ({
  standard: x.standard,
  client_code: x.client_code,
  account_name: txt(x.account_name) ?? "",
  client_name: txt(x.client_name) ?? "",
  branch: txt(x.branch) ?? "",
  ...Object.fromEntries(B2B_TEXT.map((f) => [f, txt(x[f])])),
  is_active: true,
});
const privateFields = (x) => ({
  client_id: x.client_id,
  site_id: x.site_id,
  client_name: txt(x.client_name) ?? "",
  site_name: txt(x.site_name) ?? "",
  standard: txt(x.standard),
  is_active: true,
});

/**
 * Shared delta engine: matches DB docs to cleaned rows by trimmed identity, counts like
 * the SQL (updated = joined rows, reactivated/remained_active split by prior is_active),
 * deactivates unmatched active docs and inserts unmatched rows.
 */
async function applyDelta(Model, cleaned, aField, bField, toFields, session) {
  const byKey = new Map(cleaned.map((r) => [r._key, r]));
  const docs = await Model.find({}, { _id: 1, [aField]: 1, [bField]: 1, is_active: 1 }).session(session).lean();
  let updated = 0;
  let reactivated = 0;
  let remainedActive = 0;
  let deactivated = 0;
  const matched = new Set();
  const ops = [];
  for (const doc of docs) {
    const k = docKey(doc[aField], doc[bField]);
    const row = k == null ? undefined : byKey.get(k);
    if (row) {
      updated += 1;
      if (isActive(doc)) remainedActive += 1; else reactivated += 1;
      matched.add(k);
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: toFields(row) } } });
    } else if (isActive(doc)) {
      deactivated += 1;
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { is_active: false } } } });
    }
  }
  if (ops.length) await Model.bulkWrite(ops, { session, ordered: true });
  const inserts = cleaned.filter((r) => !matched.has(r._key)).map(toFields);
  if (inserts.length) await Model.insertMany(inserts, { session });
  return { updated, reactivated, remainedActive, deactivated, added: cleaned.length - updated };
}

async function syncWorkVehicles({ p_rows }, { user }) {
  requireAdmin(user);
  if (!Array.isArray(p_rows)) throw badRequest("Invalid work vehicle file");
  if (p_rows.some((r) => !isObject(r))) throw badRequest("Invalid work vehicle row");
  const { blanks, invalid, cleaned } = cleanRows(p_rows, "standard", "client_code");
  if (cleaned.length === 0) throw badRequest("לא נמצאו רכבי עבודה תקינים; המאגר לא שונה");
  const duplicates = p_rows.length - blanks - invalid - cleaned.length;
  await prepareLock("b2b_clients");
  return withTransaction(async (session) => {
    await takeLock("b2b_clients", session);
    const d = await applyDelta(B2BClient, cleaned, "standard", "client_code", workFields, session);
    const skipped = blanks + invalid;
    const result = {
      added: d.added, updated: d.updated, active: cleaned.length, reactivated: d.reactivated,
      remained_active: d.remainedActive, deactivated: d.deactivated, duplicates, blanks, invalid, skipped,
    };
    await logAction(user, "סנכרון מאגר רכב עבודה",
      `${d.reactivated} הוחזרו לפעיל, ${d.remainedActive} נותרו פעילים, ${d.added} חדשים, ${d.deactivated} לא פעילים, ${skipped} שורות ריקות/לא תקינות דולגו, ${duplicates} כפולים דולגו`,
      result, session);
    return result;
  });
}

async function syncPrivateVehicles({ p_rows }, { user }) {
  requireAdmin(user);
  if (!Array.isArray(p_rows)) throw badRequest("Invalid private vehicle file");
  if (p_rows.some((r) => !isObject(r))) throw badRequest("Invalid private vehicle row");
  const { blanks, invalid, cleaned } = cleanRows(p_rows, "client_id", "site_id");
  if (invalid > 0) throw badRequest("יש למלא מספר לקוח ומספר אתר בכל שורה שאינה ריקה");
  if (cleaned.length === 0) throw badRequest("לא נמצאו רכבים פרטיים תקינים; המאגר לא שונה");
  const duplicates = p_rows.length - blanks - cleaned.length;
  await prepareLock("regular_clients");
  return withTransaction(async (session) => {
    await takeLock("regular_clients", session);
    const d = await applyDelta(RegularClient, cleaned, "client_id", "site_id", privateFields, session);
    const result = { added: d.added, updated: d.updated, deactivated: d.deactivated, duplicates, blanks };
    await logAction(user, "סנכרון מאגר רכב פרטי",
      `${d.added} חדשים, ${d.updated} עודכנו, ${d.deactivated} לא פעילים, ${duplicates} כפולים דולגו`,
      { ...result, reactivated: d.reactivated, remained_active: d.remainedActive }, session);
    return result;
  });
}

/**
 * Legacy generic entry point (not called by the current UI). Strict: no trimming or
 * blank skipping, exact-value identities, any missing/duplicate key aborts.
 */
async function syncVehiclePool({ p_pool, p_rows }, { user }) {
  requireAdmin(user);
  if (!Array.isArray(p_rows) || p_rows.length === 0 || p_rows.some((r) => !isObject(r))) {
    throw badRequest("Empty or invalid vehicle file");
  }
  let Model; let a; let b; let toFields; let missingMsg;
  if (p_pool === "regular") {
    Model = RegularClient; a = "client_id"; b = "site_id"; missingMsg = "Missing or duplicate client/site key";
    toFields = (x) => ({ ...privateFields(x), client_id: txt(x.client_id), site_id: txt(x.site_id) });
  } else if (p_pool === "b2b") {
    Model = B2BClient; a = "client_code"; b = "account_name"; missingMsg = "Missing or duplicate client/account key";
    toFields = (x) => ({ ...workFields(x), standard: txt(x.standard) ?? "", client_code: txt(x.client_code), account_name: txt(x.account_name) });
  } else {
    throw badRequest("Unknown vehicle pool");
  }
  const seen = new Set();
  for (const r of p_rows) {
    if (key(r[a]) == null || key(r[b]) == null) throw badRequest(missingMsg);
    const k = idKey(txt(r[a]), txt(r[b]));
    if (seen.has(k)) throw badRequest(missingMsg);
    seen.add(k);
  }
  const lockName = Model === B2BClient ? "b2b_clients" : "regular_clients";
  await prepareLock(lockName);
  return withTransaction(async (session) => {
    await takeLock(lockName, session);
    const docs = await Model.find({}, { _id: 1, [a]: 1, [b]: 1, is_active: 1 }).session(session).lean();
    const existing = new Map();
    for (const d of docs) {
      const k = idKey(d[a], d[b]);
      if (!existing.has(k)) existing.set(k, []);
      existing.get(k).push(d);
    }
    const added = p_rows.filter((r) => !existing.has(idKey(txt(r[a]), txt(r[b])))).length;
    const updated = p_rows.length - added;
    const ops = [];
    let deactivated = 0;
    for (const d of docs) {
      if (isActive(d) && !seen.has(idKey(d[a], d[b]))) {
        deactivated += 1;
        ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { is_active: false } } } });
      }
    }
    const inserts = [];
    for (const r of p_rows) {
      const fields = toFields(r);
      const matches = existing.get(idKey(txt(r[a]), txt(r[b])));
      if (matches) {
        // ON CONFLICT DO UPDATE: the identity columns themselves are not rewritten.
        const { [a]: _a, [b]: _b, ...rest } = fields;
        for (const d of matches) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: rest } } });
      } else {
        inserts.push(fields);
      }
    }
    if (ops.length) await Model.bulkWrite(ops, { session, ordered: true });
    if (inserts.length) await Model.insertMany(inserts, { session });
    const result = { added, updated, deactivated };
    await logAction(user, "סנכרון מאגר רכב", `${p_pool}: ${added} חדשים, ${updated} עודכנו, ${deactivated} לא פעילים`, result, session);
    return result;
  });
}

export default {
  sync_work_vehicles: { auth: "staff", handler: syncWorkVehicles },
  sync_private_vehicles: { auth: "staff", handler: syncPrivateVehicles },
  sync_vehicle_pool: { auth: "staff", handler: syncVehiclePool },
};
