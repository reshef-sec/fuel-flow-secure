/**
 * Row-level data access for the staff app — the server-side replacement for the
 * PostgREST table API + RLS policies. The browser sends a small query descriptor
 * (built by src/lib/apiClient.ts); every read and write is filtered here by role:
 *
 *   admin       full access
 *   viewer      read-only, all rows (no confidential columns)
 *   branch      reads own branch; writes rows in own branch / own supervisor_id
 *   supervisor  reads own rows (supervisor_id); writes own branch / own rows
 *
 * Confidential columns (redemption codes) are never returned through this route.
 */
import { Router } from "express";
import { TABLES } from "../models.js";
import { ah, badRequest, forbidden } from "../errors.js";
import { requireAuth } from "../auth.js";
import { guardVoucherWrite } from "../lib/issuanceGuard.js";
import { currentIp } from "../lib/requestContext.js";

const router = Router();

const ALL = () => ({});
const NONE = () => null;
const isAdmin = (u) => u.role === "admin";
const adminOnly = (u) => (isAdmin(u) ? {} : null);
const signedInRead = ALL;

/** Read scope for operational tables (vouchers / worker_links / signatures_archive). */
const ownScopeRead = (u) => {
  if (u.role === "admin" || u.role === "viewer") return {};
  if (u.role === "branch") return { branch: u.branch };
  if (u.role === "supervisor") return { supervisor_id: u.id };
  return null;
};
/** Write scope: "Staff write/update own scope" = own branch OR own supervisor_id. */
const ownScopeWrite = (u) => {
  if (u.role === "admin") return {};
  if (u.role === "viewer") return null;
  return { $or: [{ branch: u.branch }, { supervisor_id: u.id }] };
};
const ownScopeCheck = (u, row) =>
  u.role === "admin" || (u.role !== "viewer" && (row.branch === u.branch || row.supervisor_id === u.id));

const notViewer = (u) => (u.role === "viewer" ? null : {});

const POLICIES = {
  app_settings: { read: signedInRead, write: adminOnly },
  app_users: { read: signedInRead, write: adminOnly, hidden: ["national_id"] },
  branches: { read: signedInRead, write: adminOnly },
  issue_reasons: { read: signedInRead, write: adminOnly },
  b2b_clients: { read: signedInRead, write: adminOnly },
  regular_clients: { read: signedInRead, write: adminOnly },
  voucher_requests: { read: signedInRead, write: notViewer, del: adminOnly },
  vouchers: {
    read: ownScopeRead, write: ownScopeWrite, check: ownScopeCheck, del: adminOnly,
    hidden: ["real_code", "paz_match_key"],
    // Server-owned columns a client may never set directly.
    immutable: ["real_code", "card_number", "paz_match_key", "redeemed_at"],
  },
  worker_links: { read: ownScopeRead, write: ownScopeWrite, check: ownScopeCheck, del: adminOnly },
  signatures_archive: { read: ownScopeRead, write: ownScopeWrite, check: ownScopeCheck, del: adminOnly },
  activity_log: {
    read: adminOnly, write: NONE, del: NONE,
    // Users may only append entries in their own name.
    insert: ALL,
    stamp: (u, row) => ({ ...row, user_id: u.id, ip_address: currentIp() }),
  },
};

/** Largest single page of a table read. */
const MAX_ROWS = 5000;
const OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "in", "is"]);
const COL = /^[a-z_][a-z0-9_]*$/;

function toMongoFilter(filters = []) {
  const f = {};
  for (const { col, op, value } of filters) {
    if (!COL.test(col) || !OPS.has(op)) throw badRequest(`Unsupported filter ${col}.${op}`);
    const v = op === "in" ? { $in: Array.isArray(value) ? value : [] }
      : op === "eq" ? value
      : op === "is" ? (value === null ? null : value)
      : { [`$${op}`]: value };
    if (f[col] !== undefined) f.$and = [...(f.$and ?? []), { [col]: v }];
    else f[col] = v;
  }
  return f;
}

function and(...parts) {
  const xs = parts.filter((p) => p && Object.keys(p).length);
  if (!xs.length) return {};
  return xs.length === 1 ? xs[0] : { $and: xs };
}

function cleanValues(values, policy) {
  const out = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (!COL.test(k) || k === "_id" || k === "created_at" || k === "updated_at") continue;
    if (k === "password_hash" || k === "token_version") continue;
    if (policy.immutable?.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

function shape(doc, policy, columns) {
  const o = { ...doc };
  delete o._id;
  for (const h of policy.hidden ?? []) delete o[h];
  if (columns && columns !== "*") {
    const keep = columns.split(",").map((c) => c.trim()).filter(Boolean);
    return Object.fromEntries(keep.map((c) => [c, o[c] ?? null]));
  }
  return o;
}

router.post("/:table", requireAuth, ah(async (req, res) => {
  const table = req.params.table;
  const Model = TABLES[table];
  const policy = POLICIES[table];
  if (!Model || !policy) throw forbidden("טבלה לא קיימת או לא זמינה");
  const u = req.user;
  const q = req.body ?? {};
  const filter = toMongoFilter(q.filters);

  switch (q.op) {
    case "select": {
      const scope = policy.read(u);
      if (scope === null) throw forbidden();
      let cursor = Model.find(and(filter, scope)).lean();
      if (q.order?.col && COL.test(q.order.col)) cursor = cursor.sort({ [q.order.col]: q.order.asc === false ? -1 : 1, _id: 1 });
      else cursor = cursor.sort({ _id: 1 });
      const from = Math.max(0, Number(q.range?.[0] ?? 0));
      const to = q.range ? Number(q.range[1]) : from + Math.min(Number(q.limit ?? 1000), MAX_ROWS) - 1;
      const limit = Math.min(MAX_ROWS, Math.max(0, to - from + 1), q.limit ? Number(q.limit) : MAX_ROWS);
      const rows = await cursor.skip(from).limit(limit);
      return res.json({ data: rows.map((r) => shape(r, policy, q.columns)) });
    }
    case "insert": {
      const scope = (policy.insert ?? policy.write)(u);
      if (scope === null) throw forbidden();
      const list = (Array.isArray(q.values) ? q.values : [q.values]).map((v) => cleanValues(v, policy));
      const rows = list.map((r) => (policy.stamp ? policy.stamp(u, r) : r));
      if (policy.check && !rows.every((r) => policy.check(u, r))) throw forbidden();
      // vouchers BEFORE INSERT triggers (active client/vehicle on link assignment, expiry).
      if (table === "vouchers") for (const r of rows) Object.assign(r, await guardVoucherWrite(r, null));
      await Model.insertMany(rows, { ordered: true });
      return res.json({ data: null });
    }
    case "upsert": {
      const scope = policy.write(u);
      if (scope === null) throw forbidden();
      const keys = String(q.onConflict ?? defaultKey(table)).split(",").map((k) => k.trim());
      const list = (Array.isArray(q.values) ? q.values : [q.values]).map((v) => cleanValues(v, policy));
      for (const row of list) {
        if (policy.check && !policy.check(u, row)) throw forbidden();
        const key = Object.fromEntries(keys.map((k) => [k, row[k]]));
        if (keys.some((k) => row[k] === undefined)) throw badRequest("Upsert key missing");
        const existing = await Model.findOne(key).lean();
        if (existing && Object.keys(scope).length && !(await Model.exists(and(key, scope)))) throw forbidden();
        if (table === "vouchers") Object.assign(row, await guardVoucherWrite({ ...existing, ...row }, existing));
        await Model.findOneAndUpdate(key, { $set: row }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
      }
      return res.json({ data: null });
    }
    case "update": {
      const scope = policy.write(u);
      if (scope === null) throw forbidden();
      if (!q.filters?.length) throw badRequest("Update requires a filter");
      const set = cleanValues(q.values, policy);
      const where = and(filter, scope, policy.read(u));
      // vouchers BEFORE UPDATE OF link_id triggers: checked per row before anything is written.
      if (table === "vouchers" && "link_id" in set) {
        for (const d of await Model.find(where).lean()) await guardVoucherWrite({ ...d, ...set }, d);
      }
      if (policy.check && u.role !== "admin") {
        const docs = await Model.find(where).lean();
        if (!docs.every((d) => policy.check(u, { ...d, ...set }))) throw forbidden();
        await Model.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { $set: set }, { runValidators: true });
      } else {
        await Model.updateMany(where, { $set: set }, { runValidators: true });
      }
      return res.json({ data: null });
    }
    case "delete": {
      const scope = (policy.del ?? policy.write)(u);
      if (scope === null) throw forbidden();
      if (!q.filters?.length) throw badRequest("Delete requires a filter");
      await Model.deleteMany(and(filter, scope));
      return res.json({ data: null });
    }
    default:
      throw badRequest("Unsupported operation");
  }
}));

function defaultKey(table) {
  return {
    app_users: "id", app_settings: "key", branches: "id", issue_reasons: "id",
    regular_clients: "client_id,site_id", b2b_clients: "client_code,standard", vouchers: "serial",
    voucher_requests: "id", worker_links: "id", signatures_archive: "id",
  }[table] ?? "id";
}

export default router;
