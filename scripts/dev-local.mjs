/**
 * Local development backend with a throwaway database and demo data.
 *
 *   npm run dev:local     (API on :3000; then `npm run dev` for the site on :8080)
 *
 * Uses MONGODB_URI if set; otherwise starts an in-memory MongoDB replica set.
 * Seeds demo data only when the database has no users. Demo logins (local testing only):
 */
export const DEMO_USERS = [
  { role: "admin", national_id: "300000001", phone: "0500000001", first_name: "מאיה", last_name: "קורן", branch: "", title: "מנהלת מערכת", can_request: true },
  { role: "branch", national_id: "300000003", phone: "0500000003", first_name: "מיכל", last_name: "לוי", branch: "חיפה", title: "מנהלת סניף", can_request: true },
  { role: "branch", national_id: "300000004", phone: "0500000004", first_name: "רון", last_name: "גבאי", branch: "תל אביב", title: "מנהל סניף", can_request: true },
  { role: "supervisor", national_id: "300000005", phone: "0500000005", first_name: "דני", last_name: "כהן", branch: "חיפה", title: "מפקח", can_request: true },
  { role: "supervisor", national_id: "300000007", phone: "0500000007", first_name: "יוסי", last_name: "פרץ", branch: "חיפה", title: "מפקח", can_request: false },
  { role: "viewer", national_id: "300000006", phone: "0500000006", first_name: "נועה", last_name: "אברהם", branch: "", title: "צופה", can_request: false },
];
export const DEMO_PASSWORD = "Demo2026x"; // every demo user; local in-memory database only

import { fileURLToPath } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDb } from "../server/db.js";
import { createApp } from "../server/app.js";
import * as M from "../server/models.js";
import { hashPassword } from "../server/auth.js";

process.env.JWT_SECRET ??= "local-dev-secret-local-dev-secret-0123456789";
process.env.DEV_TOOLS_OWNER_NATIONAL_ID ??= "300000001";

let uri = process.env.MONGODB_URI;
if (!uri) {
  // Reuse the mongod binary the test suite already downloaded, whatever the cwd.
  process.env.MONGOMS_DOWNLOAD_DIR ??= fileURLToPath(new URL("../node_modules/.cache/mongodb-memory-server", import.meta.url));
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  uri = rs.getUri("reshef-dev");
  process.on("SIGINT", async () => { await rs.stop(); process.exit(0); });
}
await connectDb(uri);

if (!(await M.Profile.countDocuments())) {
  const hash = await hashPassword(DEMO_PASSWORD);
  for (const u of DEMO_USERS) {
    await M.AppUser.create({ ...u, requires_password_change: false });
    await M.Profile.create({
      phone: u.phone, national_id: u.national_id, full_name: `${u.last_name} ${u.first_name}`, branch: u.branch,
      role: u.role, password_hash: hash, requires_password_change: false,
    });
  }
  await M.Branch.create([
    { id: "b-haifa", name: "חיפה", manager: "לוי מיכל", city: "חיפה" },
    { id: "b-ta", name: "תל אביב", manager: "גבאי רון", city: "תל אביב" },
    { id: "b-bs", name: "באר שבע", manager: "", city: "באר שבע" },
  ]);
  await M.IssueReason.create([
    { name: "תדלוק רכב עבודה", category: "B2B" }, { name: "נסיעה לאתר לקוח", category: "B2B" },
    { name: "החזר הוצאות רכב פרטי", category: "Regular" }, { name: "משמרת לילה", category: "Regular" },
  ]);
  await M.B2BClient.create([
    { standard: "80620031", client_code: "5521", account_name: "מוקד חיפה מזרח", client_name: "עיריית חיפה", branch: "חיפה" },
    { standard: "80620044", client_code: "7710", account_name: "מתחם הנמל", client_name: "נמל חיפה", branch: "חיפה" },
    { standard: "80621002", client_code: "7811", account_name: "קמפוס דרום", client_name: "אוניברסיטת בן גוריון", branch: "באר שבע" },
    { standard: "80621010", client_code: "7815", account_name: "אבטחת אירועים", client_name: "היכל התרבות", branch: "תל אביב", is_active: false },
  ]);
  await M.RegularClient.create([
    { client_id: "5521", client_name: "בנק הפועלים", site_id: "12", site_name: "סניף מרכזי", standard: "7001" },
    { client_id: "5521", client_name: "בנק הפועלים", site_id: "14", site_name: "סניף הדר", standard: "7002" },
    { client_id: "7710", client_name: "אינטל ישראל", site_id: "3", site_name: "קריית גת", standard: "7100", is_active: false },
  ]);
  const vouchers = [];
  let n = 0;
  const add = (fuel, amount, count, extra = {}) => {
    for (let i = 0; i < count; i += 1) {
      n += 1;
      vouchers.push({ serial: `70${String(418200 + n).padStart(7, "0")}`, card_number: `70${String(418200 + n).padStart(7, "0")}`, amount, fuel_type: fuel, branch: "מאגר ראשי", status: "טרם שומש", ...extra });
    }
  };
  add("בנזין", 100, 40); add("בנזין", 500, 12); add("סולר", 50, 30); add("סולר", 100, 20); add("סולר", 500, 6);
  const sup = await M.Profile.findOne({ national_id: "300000005" });
  add("בנזין", 100, 8, { branch: "חיפה", supervisor: "כהן דני", supervisor_id: sup.id });
  add("סולר", 50, 6, { branch: "חיפה", supervisor: "כהן דני", supervisor_id: sup.id });
  add("בנזין", 100, 5, { branch: "חיפה", supervisor: "כהן דני", supervisor_id: sup.id, status: "הוקצה לעובד", employee_name: "ישראלי אבי", worker_name: "ישראלי אבי", route: "regular", client_id: "5521", site_id: "12", site_name: "סניף מרכזי", issued_at: new Date(), expires_at: new Date(Date.now() + 90 * 864e5) });
  add("בנזין", 500, 4, { branch: "תל אביב", status: "מומש סופית", redeemed_at: new Date() });
  await M.Voucher.insertMany(vouchers);
  await M.VoucherCode.insertMany(vouchers.map((v) => ({ serial: v.serial, real_code: `RC${v.serial.slice(-6)}`, card_number: v.card_number })));
  await M.VoucherRequest.create([
    { id: "req-1", requester: "לוי מיכל", requester_id: "300000003", branch: "חיפה", amount: 1500, reason: "תגבור משמרות", created_on: new Date().toISOString().slice(0, 10), benzine_amount: 1000, diesel_amount: 500 },
    { id: "req-2", requester: "גבאי רון", requester_id: "300000004", branch: "תל אביב", amount: 800, reason: "אירוע לקוח", created_on: new Date().toISOString().slice(0, 10), benzine_amount: 800, diesel_amount: 0 },
  ]);
  await M.AppSetting.updateOne({ key: "main" }, { $set: { balance: 0 } });
  console.log(`Seeded demo data: ${vouchers.length} cards, ${DEMO_USERS.length} users`);
}

createApp({ staticDir: "/nonexistent" }).listen(3000, "0.0.0.0", () => console.log("Local API ready on http://localhost:3000"));
