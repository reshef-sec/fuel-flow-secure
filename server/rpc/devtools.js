/**
 * Development tools — ports of can_use_development_tools, generate_demo_data,
 * reset_development_data and the disabled reset_demo_data (database/development_tools.sql).
 *
 * Authorization is pinned to the single immutable owner identity (isDevToolsOwner: env
 * DEV_TOOLS_OWNER_NATIONAL_ID / DEV_TOOLS_OWNER_PHONE + admin role, fail closed) and is
 * re-checked server-side by every destructive entry point.
 * lock_development_transactions is internal only (the SQL revoked it from clients).
 */
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import {
  ActivityLog, AppSetting, Branch, SignatureArchive, Voucher, VoucherCode, VoucherRequest, WorkerLink,
} from "../models.js";
import { withTransaction } from "../db.js";
import { scopedLockId } from "../lib/learningContext.js";
import { isDevToolsOwner } from "../auth.js";
import { logAction } from "../lib/audit.js";
import { MAIN_POOL, STATUS } from "../lib/canonical.js";
import { badRequest, forbidden } from "../errors.js";

export const RESET_CONFIRMATION = "איפוס וניקוי נתונים";
const DENIED = "אין הרשאה לכלי פיתוח ובדיקות";

/** Fixed allowlist of transactional collections (never caller supplied). Master data is preserved. */
const TRANSACTIONAL = [ActivityLog, SignatureArchive, VoucherCode, VoucherRequest, Voucher, WorkerLink];
/** generate_demo_data refuses to mix synthetic stock into any of these when populated. */
const MUST_BE_EMPTY = [Voucher, VoucherCode, WorkerLink, VoucherRequest, SignatureArchive];

function requireOwner(user) {
  if (!isDevToolsOwner(user)) throw forbidden(DENIED);
}

/**
 * lock_development_transactions: a single lock document written inside the maintenance
 * transaction so two maintenance runs cannot interleave (MongoDB has no table locks).
 */
async function lockDevelopmentTransactions(user, session) {
  requireOwner(user);
  const col = mongoose.connection.collection("rpc_locks");
  await col.updateOne({ _id: scopedLockId("development") }, { $setOnInsert: { n: 0 } }, { upsert: true });
  await col.updateOne({ _id: scopedLockId("development") }, { $inc: { n: 1 }, $set: { at: new Date() } }, { session });
}

const jerusalemDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

async function generateDemoData(_params, { user }) {
  requireOwner(user);
  return withTransaction(async (session) => {
    await lockDevelopmentTransactions(user, session);
    for (const Model of MUST_BE_EMPTY) {
      if (await Model.exists({}).session(session)) throw badRequest("טעינת הדגמה אפשרית רק כשנתוני הפעילות ריקים");
    }
    const names = await Branch.distinct("name", {}).session(session);
    // SELECT 'מאגר ראשי' UNION SELECT DISTINCT name ... WHERE nullif(trim(name),'') IS NOT NULL
    const pools = [...new Set([MAIN_POOL, ...names.filter((n) => typeof n === "string" && n.trim() !== "").sort()])];
    const batch = randomUUID();
    const today = jerusalemDate();
    const docs = [];
    let n = 0;
    for (const pool of pools) {
      for (const fuel of ["בנזין", "סולר"]) {
        for (let i = 1; i <= 10; i += 1) {
          n += 1;
          // Denominations: petrol 100 (multiple of 100), diesel 50 (multiple of 50).
          docs.push({
            serial: `DEMO-${batch}-${n}`, real_code: "", amount: fuel === "בנזין" ? 100 : 50,
            fuel_type: fuel, branch: pool, status: STATUS.AVAILABLE, updated_on: today,
          });
        }
      }
    }
    // Each pool gets 1,000 NIS petrol + 500 NIS diesel of real test inventory, never a fake saved budget.
    await Voucher.insertMany(docs, { session });
    await logAction(user, "טעינת נתוני הדגמה", `${n} שוברים לבדיקה בלבד`, { vouchers_created: n }, session);
    return { vouchers_created: n };
  });
}

async function resetDevelopmentData({ p_confirmation }, { user }) {
  requireOwner(user);
  if (p_confirmation !== RESET_CONFIRMATION) throw badRequest("נדרש אישור מפורש למחיקה");
  await withTransaction(async (session) => {
    await lockDevelopmentTransactions(user, session);
    for (const Model of TRANSACTIONAL) await Model.deleteMany({}, { session });
    await AppSetting.updateOne({ key: "main" }, { $set: { balance: 0 } }, { session });
    // Profiles, app_users, branches, clients and reasons are preserved.
    // No activity entry is written after reset: transactional collections stay empty.
  });
  return null;
}

async function resetDemoData(_params, { user }) {
  requireOwner(user);
  throw badRequest("Use reset_development_data with explicit confirmation");
}

export default {
  // Public so a signed-out / first-login caller simply gets false (fails closed, never throws).
  can_use_development_tools: { auth: "public", handler: async (_p, { user }) => isDevToolsOwner(user) },
  generate_demo_data: { auth: "staff", handler: generateDemoData },
  reset_development_data: { auth: "staff", handler: resetDevelopmentData },
  reset_demo_data: { auth: "staff", handler: resetDemoData },
};
