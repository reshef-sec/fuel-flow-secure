/**
 * One-time data migration: Supabase (Postgres) → MongoDB Atlas.
 *
 *   node --env-file=.env scripts/migrate-from-supabase.mjs            # dry run (counts only)
 *   node --env-file=.env scripts/migrate-from-supabase.mjs --write    # copy data
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API)
 * and MONGODB_URI. Idempotent: rows are upserted by their natural key, so it can be re-run.
 *
 * Passwords cannot be exported through the API. Every staff member gets a fresh login
 * whose initial password is their ת.ז and is forced to choose a new password on first login.
 */
import mongoose from "mongoose";
import { connectDb } from "../server/db.js";
import { TABLES, Profile } from "../server/models.js";
import { hashPassword, normalizePhone } from "../server/auth.js";
import { pazMatchKey } from "../server/lib/canonical.js";

const WRITE = process.argv.includes("--write");
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

const KEYS = {
  app_settings: ["key"], app_users: ["national_id"], branches: ["id"], issue_reasons: ["id"],
  b2b_clients: ["id"], regular_clients: ["client_id", "site_id"], vouchers: ["serial"],
  voucher_codes: ["serial"], voucher_requests: ["id"], worker_links: ["id"],
  signatures_archive: ["id"], activity_log: ["id"],
};

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}`, "Range-Unit": "items" },
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

await connectDb();
const report = {};
for (const [table, keys] of Object.entries(KEYS)) {
  const rows = await fetchAll(table);
  report[table] = rows.length;
  if (!WRITE) continue;
  const Model = TABLES[table];
  const ops = rows.map((r) => {
    const doc = { ...r };
    if (table === "vouchers") doc.paz_match_key = pazMatchKey(r.card_number ?? r.serial);
    return { updateOne: { filter: Object.fromEntries(keys.map((k) => [k, r[k]])), update: { $set: doc }, upsert: true } };
  });
  for (let i = 0; i < ops.length; i += 500) await Model.bulkWrite(ops.slice(i, i + 500), { ordered: false, timestamps: false });
}

// Logins: profiles keep their original UUID so supervisor_id references stay valid.
const profiles = await fetchAll("profiles");
const roles = await fetchAll("user_roles");
report.profiles = profiles.length;
if (WRITE) {
  for (const p of profiles) {
    const role = roles.find((r) => r.user_id === p.id && r.role === "admin") ? "admin" : (roles.find((r) => r.user_id === p.id)?.role ?? p.role);
    if (await Profile.exists({ id: p.id })) continue;
    await Profile.create({
      id: p.id, phone: normalizePhone(p.phone), national_id: p.national_id, full_name: p.full_name, branch: p.branch,
      role, password_hash: await hashPassword(p.national_id), requires_password_change: true,
    });
  }
}

console.log(WRITE ? "Migrated:" : "Dry run — rows found:", report);
await mongoose.disconnect();
