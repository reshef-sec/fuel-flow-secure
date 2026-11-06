/**
 * Inventory RPC regression tests (ports of database/*.test.sql scenarios + concurrency).
 * Run: node --test server/tests/inventory.test.js
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import { Voucher, VoucherCode, WorkerLink, RegularClient, B2BClient, ActivityLog, AppUser, Profile } from "../models.js";
import { STATUS, MAIN_POOL } from "../lib/canonical.js";

const SHORTAGE = "אין מספיק מלאי זמין במאגר עבור סוג דלק וסכום זה";
const DENOMINATION = "בנזין בכפולות של 50 ₪ וסולר בכפולות של 100 ₪";
const AMBIGUOUS = "נמצאו מספרי כרטיסים דו־משמעיים לאחר הסרת אפסים מובילים; יש לבדוק את המלאי לפני הייבוא";
const REG = { route: "regular", client_id: "C1", site_id: "S1" };

const seed = (rows) => Voucher.insertMany(rows.map((r) => ({
  amount: 100, fuel_type: "בנזין", branch: MAIN_POOL, status: STATUS.AVAILABLE, real_code: "SECRET-" + r.serial, ...r,
})));

let admin;
before(async () => { await startTestServer(); }, { timeout: 600_000 });
after(async () => { await stopTestServer(); });
beforeEach(async () => {
  await resetDb();
  await RegularClient.create({ client_id: "C1", site_id: "S1", client_name: "לקוח", site_name: "אתר", is_active: true });
  admin = (await loginAs("admin", { fullName: "Admin Main" })).agent;
});

// ───────────── snapshot / summary ─────────────

test("central snapshot totals, summary wrapper, counts and stock", async () => {
  await seed([
    { serial: "A1" }, { serial: "A2", amount: 200 }, { serial: "A3", amount: 100, fuel_type: "סולר" },
    { serial: "A4", amount: 100, fuel_type: " Diesel " }, // lower(btrim) → diesel
    { serial: "A5", branch: "מאגר מרכזי" },
    { serial: "X1", branch: "צפון" }, // branch stock
    { serial: "X2", supervisor: "Someone" }, // held by supervisor
    { serial: "X3", status: STATUS.ISSUED, link_id: "1234" },
    { serial: "X4", status: STATUS.REDEEMED },
  ]);
  const snap = await rpc(admin, "get_central_inventory_snapshot");
  assert.equal(snap.status, 200);
  assert.deepEqual(snap.data, {
    total_available_amount: 600, gasoline_amount: 400, diesel_amount: 200,
    denominations: [
      { amount: 100, fuel_type: "בנזין", count: 2 },
      { amount: 100, fuel_type: "סולר", count: 2 },
      { amount: 200, fuel_type: "בנזין", count: 1 },
    ],
  });
  const sum = await rpc(admin, "get_central_inventory_summary");
  assert.deepEqual(sum.data, [{ total_available_amount: 600, gasoline_amount: 400, diesel_amount: 200 }]);

  const counts = await rpc(admin, "central_inventory_counts");
  // strict SQL filter: branch='מאגר ראשי', supervisor IS NULL, exact fuel_type grouping
  assert.deepEqual(counts.data, [
    { fuel_type: " Diesel ", amount: 100, cards: 1, total: 100 },
    { fuel_type: "בנזין", amount: 100, cards: 1, total: 100 },
    { fuel_type: "בנזין", amount: 200, cards: 1, total: 200 },
    { fuel_type: "סולר", amount: 100, cards: 1, total: 100 },
  ]);
  assert.equal((await rpc(admin, "central_stock_available", { _fuel: "בנזין" })).data, 300);

  const branch = (await loginAs("branch", { branch: "צפון" })).agent;
  const denied = await rpc(branch, "get_central_inventory_snapshot");
  assert.equal(denied.status, 403);
  assert.equal(denied.error, "Admin access required");
  assert.deepEqual((await rpc(branch, "central_inventory_counts")).data, []);
  assert.equal((await rpc(branch, "central_stock_available", { _fuel: "בנזין" })).data, 0);
});

// ───────────── issuance ─────────────

test("issuance rejects invalid denominations", async () => {
  await seed([{ serial: "B1" }, { serial: "B2", amount: 100, fuel_type: "סולר" }]);
  for (const item of [{ amount: 120, fuel_type: "בנזין" }, { amount: 75, fuel_type: "סולר" }, { amount: 0, fuel_type: "סולר" }, { amount: null, fuel_type: "בנזין" }]) {
    const r = await rpc(admin, "issue_voucher_to_worker", { p_items: [{ ...item, details: REG }], p_branch: MAIN_POOL, p_supervisor: null, p_link: { id: "123456", employee_name: "Worker", phone: "0521234567" } });
    assert.equal(r.status, 400, JSON.stringify(item));
    assert.equal(r.error, DENOMINATION);
  }
  const t = await rpc(admin, "transfer_voucher_stock", { p_items: [{ amount: 120, fuel_type: "בנזין", serials: ["B1"] }], p_branch: "צפון" });
  assert.equal(t.error, DENOMINATION);
  assert.equal(await WorkerLink.countDocuments(), 0);
});

test("issuance shortage rolls back every item and creates no link", async () => {
  await seed([{ serial: "S1" }, { serial: "S2" }, { serial: "D1", amount: 100, fuel_type: "סולר" }]);
  const r = await rpc(admin, "issue_voucher_to_worker", {
    p_items: [{ amount: 200, fuel_type: "בנזין", details: REG }, { amount: 200, fuel_type: "סולר", details: REG }],
    p_branch: MAIN_POOL, p_supervisor: null, p_link: { id: "777777", employee_name: "Worker", phone: "0521234567" },
  });
  assert.equal(r.status, 400);
  assert.equal(r.error, SHORTAGE);
  assert.equal(await Voucher.countDocuments({ status: STATUS.AVAILABLE, link_id: null }), 3);
  assert.equal(await WorkerLink.countDocuments(), 0);
});

test("issuance returns the safe JSONB envelope and persists the link atomically", async () => {
  await seed([
    { serial: "0001", fuel_type: "בנזין 95" }, { serial: "0002", amount: 100, fuel_type: "סולר" },
    { serial: "0003", amount: 200 }, { serial: "0004" },
  ]);
  const r = await rpc(admin, "issue_voucher_to_worker", {
    p_items: [{ amount: 300, fuel_type: "בנזין", details: { ...REG, requester: "R" } }, { amount: 100, fuel_type: "סולר", details: REG }],
    p_branch: MAIN_POOL, p_supervisor: null, p_link: { id: "123456", employee_name: "  Test Employee ", phone: "0521234567" },
  });
  assert.equal(r.status, 200, r.error);
  assert.equal(r.data.link_id, "123456");
  assert.equal(r.data.total, 400);
  assert.equal(r.data.vouchers.length, 3);
  // largest-first greedy: 200 (0003) + 100 (0001, lowest serial)
  assert.deepEqual(r.data.vouchers.map((v) => [v.serial, v.item_index]), [["0001", 0], ["0003", 0], ["0002", 1]]);
  for (const v of r.data.vouchers) {
    assert.deepEqual(Object.keys(v).sort(), ["amount", "card_number", "expires_at", "fuel_type", "issued_at", "item_index", "link_id", "serial", "status"]);
    assert.equal(v.link_id, "123456");
    assert.equal(v.status, STATUS.ISSUED);
    assert.ok(new Date(v.expires_at) > new Date(v.issued_at));
  }
  assert.ok(!JSON.stringify(r.data).includes("SECRET"));
  assert.ok(!JSON.stringify(r.data).includes("real_code"));
  const link = await WorkerLink.findOne({ id: "123456" }).lean();
  assert.equal(link.total, 400);
  assert.deepEqual([...link.serials].sort(), ["0001", "0002", "0003"]);
  assert.equal(link.employee_name, "Test Employee");
  const card = await Voucher.findOne({ serial: "0001" }).lean();
  assert.equal(card.fuel_type, "בנזין"); // canonical fuel written back
  assert.equal(card.requester, "R");
  assert.equal(card.worker_name, "Test Employee");
  assert.equal((await Voucher.findOne({ serial: "0004" }).lean()).status, STATUS.AVAILABLE);

  // Duplicate link id: the link insert fails and the voucher claims roll back.
  const dup = await rpc(admin, "issue_voucher_to_worker", {
    p_items: [{ amount: 100, fuel_type: "בנזין", details: REG }], p_branch: MAIN_POOL, p_supervisor: null,
    p_link: { id: "123456", employee_name: "Other", phone: "0521234567" },
  });
  assert.equal(dup.status, 409);
  const s4 = await Voucher.findOne({ serial: "0004" }).lean();
  assert.equal(s4.status, STATUS.AVAILABLE);
  assert.equal(s4.link_id, null);

  const bad = await rpc(admin, "issue_voucher_to_worker", { p_items: [{ amount: 100, fuel_type: "בנזין" }], p_branch: MAIN_POOL, p_link: { id: "12", employee_name: "X Y", phone: "0521234567" } });
  assert.equal(bad.error, "פרטי לינק לא תקינים");
  const none = await rpc(admin, "issue_voucher_to_worker", { p_items: [], p_branch: MAIN_POOL, p_link: { id: "5555", employee_name: "X Y", phone: "0521234567" } });
  assert.equal(none.error, "יש לבחור שוברים");
});

test("issuance is blocked for inactive or missing clients", async () => {
  await seed([{ serial: "C1" }, { serial: "C2", branch: "צפון" }]);
  await RegularClient.updateOne({ client_id: "C1" }, { is_active: false });
  await B2BClient.create({ client_code: "B9", standard: "STD", is_active: false });
  const issue = (details, id) => rpc(admin, "issue_voucher_to_worker", {
    p_items: [{ amount: 100, fuel_type: "בנזין", details }], p_branch: MAIN_POOL, p_supervisor: null, p_link: { id, employee_name: "Worker", phone: "0521234567" },
  });
  assert.equal((await issue(REG, "1001")).error, "הלקוח או האתר אינם פעילים");
  assert.equal((await issue({ route: "b2b", client_code: "B9", standard: "STD" }, "1002")).error, "רכב העבודה אינו פעיל");
  assert.equal((await issue({}, "1003")).error, "יש לבחור מאגר לקוחות להנפקה");
  await B2BClient.updateOne({ client_code: "B9" }, { is_active: true, client_code: " B9 " });
  const ok = await issue({ route: "b2b", client_code: "B9", standard: "STD" }, "1004");
  assert.equal(ok.status, 200, ok.error);
  assert.equal(await WorkerLink.countDocuments(), 1);

  // Same trigger through the generic table API (legacy client write path).
  await RegularClient.updateOne({ client_id: "C1" }, { is_active: false });
  const res = await admin.post("/api/db/vouchers").send({ op: "insert", values: { serial: "T1", amount: 100, link_id: "4444", ...REG } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "הלקוח או האתר אינם פעילים");
  assert.equal(await Voucher.countDocuments({ serial: "T1" }), 0);
  const upd = await admin.post("/api/db/vouchers").send({ op: "update", filters: [{ col: "serial", op: "eq", value: "C2" }], values: { link_id: "9999" } });
  assert.equal(upd.status, 400);
  assert.equal(upd.body.error, "יש לבחור מאגר לקוחות להנפקה");
  assert.equal((await Voucher.findOne({ serial: "C2" }).lean()).link_id, null);
});

test("branch isolation and role checks", async () => {
  await seed([{ serial: "N1", branch: "צפון" }, { serial: "N2", branch: "סניף צפון" }, { serial: "D1", branch: "דרום" }, { serial: "M1" }]);
  const branch = (await loginAs("branch", { branch: "צפון" })).agent;
  const viewer = (await loginAs("viewer")).agent;
  const sup = (await loginAs("supervisor", { branch: "צפון", fullName: "Avi Cohen" })).agent;
  const link = (id) => ({ id, employee_name: "Worker", phone: "0521234567" });
  const item = [{ amount: 100, fuel_type: "בנזין", details: REG }];

  const foreign = await rpc(branch, "issue_voucher_to_worker", { p_items: item, p_branch: "דרום", p_supervisor: null, p_link: link("2001") });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.error, "אין הרשאה לסניף זה");
  assert.equal((await rpc(viewer, "issue_voucher_to_worker", { p_items: item, p_branch: "צפון", p_link: link("2002") })).status, 403);

  // Branch manager draws only its own (canonical) branch stock, never the central pool.
  const own = await rpc(branch, "issue_voucher_to_worker", { p_items: [{ amount: 200, fuel_type: "בנזין", details: REG }], p_branch: "צפון", p_supervisor: null, p_link: link("2003") });
  assert.equal(own.status, 200, own.error);
  assert.deepEqual(own.data.vouchers.map((v) => v.serial), ["N1", "N2"]);
  assert.equal((await rpc(branch, "issue_voucher_to_worker", { p_items: item, p_branch: "צפון", p_link: link("2004") })).error, SHORTAGE);

  assert.equal((await rpc(sup, "transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "בנזין", serials: ["D1"] }], p_branch: "צפון" })).error, "אין הרשאה להקצאה");
  assert.equal((await rpc(branch, "transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "בנזין", serials: ["D1"] }], p_branch: "צפון", p_supervisor: null })).error, "אין הרשאה למלאי זה");
  assert.equal((await rpc(branch, "transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "בנזין", serials: ["M1"] }], p_branch: "דרום" })).error, "אין הרשאה לסניף זה");
  for (const name of ["import_voucher_inventory", "store_voucher_codes", "reconcile_redeemed_vouchers"]) {
    const r = await rpc(branch, name, { p_rows: [{}], p_codes: [], card_numbers: ["1"] });
    assert.equal(r.status, 403, name);
    assert.equal(r.error, "Admin access required");
  }
});

test("a branch manager allocates to a supervisor who has never signed in; the cards are theirs on first login", async () => {
  await seed([{ serial: "F1", branch: "צפון" }]);
  const { agent: mgr } = await loginAs("branch", { branch: "צפון", fullName: "Dana Levi" });
  await AppUser.create({ email: "roni@example.com", first_name: "Roni", last_name: "Peretz", role: "supervisor", phone: "0521212121", branch: "צפון", can_request: false });
  const r = await rpc(mgr, "transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "בנזין", serials: ["F1"] }], p_branch: "צפון", p_supervisor: "Peretz Roni" });
  assert.equal(r.status, 200, r.error);
  const card = await Voucher.findOne({ serial: "F1" }).lean();
  assert.equal(card.supervisor, "Peretz Roni");
  assert.equal(card.supervisor_id, null);
  const other = await rpc(mgr, "transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "בנזין", serials: ["F1"] }], p_branch: "צפון", p_supervisor: "Not Here" });
  assert.equal(other.error, "המפקח אינו משויך לסניף");

  // Creating the account (first sign-in, or an admin reset) links the held card.
  const { agent: admin2 } = await loginAs("admin");
  const staff = await AppUser.findOne({ email: "roni@example.com" }).lean();
  const made = await admin2.post("/api/accounts").send({ action: "reset", id: staff.id, email: staff.email, phone: staff.phone, fullName: "Roni Peretz", branch: "צפון", role: "supervisor" });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal((await Voucher.findOne({ serial: "F1" }).lean()).supervisor_id, staff.id);
  assert.ok(await Profile.exists({ id: staff.id }));
  assert.equal((await anon().post("/api/auth/login").send({ identifier: staff.email, password: made.body.temporaryPassword })).status, 200);
});

test("transfer allocates exact serials to a supervisor, who can then issue them", async () => {
  await seed([{ serial: "T1" }, { serial: "T2", amount: 100, fuel_type: "סולר" }, { serial: "T3" }]);
  const { agent: sup, profile } = await loginAs("supervisor", { branch: "צפון", fullName: "Avi Cohen" });
  const items = [{ amount: 100, fuel_type: "בנזין", serials: ["T1"] }, { amount: 100, fuel_type: "סולר", serials: ["T2"] }];

  assert.equal((await rpc(admin, "transfer_voucher_stock", { p_items: items, p_branch: "צפון", p_supervisor: "Nobody" })).error, "המפקח אינו משויך לסניף");
  assert.equal((await rpc(admin, "transfer_voucher_stock", { p_items: [{ amount: 200, fuel_type: "בנזין", serials: ["T1", "T1"] }], p_branch: "צפון" })).error, "כרטיס נבחר יותר מפעם אחת");
  assert.equal((await rpc(admin, "transfer_voucher_stock", { p_items: [{ amount: 200, fuel_type: "בנזין", serials: ["T1"] }], p_branch: "צפון" })).error, SHORTAGE);
  assert.equal((await rpc(admin, "transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "סולר", serials: ["T1"] }], p_branch: "צפון" })).error, SHORTAGE);
  assert.equal((await rpc(admin, "transfer_voucher_stock", { p_items: items, p_branch: " " })).error, "יש לבחור סניף");

  const ok = await rpc(admin, "transfer_voucher_stock", { p_items: items, p_branch: "צפון", p_supervisor: "Cohen Avi" });
  assert.equal(ok.status, 200, ok.error);
  assert.equal(ok.data, null);
  const t1 = await Voucher.findOne({ serial: "T1" }).lean();
  assert.equal(t1.branch, "צפון");
  assert.equal(t1.supervisor, "Cohen Avi");
  assert.equal(t1.supervisor_id, profile.id);
  assert.equal(t1.status, STATUS.AVAILABLE);
  assert.equal(t1.link_id, null);
  // Already transferred: no second allocation from the central pool.
  assert.equal((await rpc(admin, "transfer_voucher_stock", { p_items: [items[0]], p_branch: "דרום" })).error, SHORTAGE);

  const issued = await rpc(sup, "issue_voucher_to_worker", {
    p_items: [{ amount: 100, fuel_type: "בנזין", details: REG }], p_branch: "צפון", p_supervisor: "Cohen Avi", p_link: { id: "3001", employee_name: "Worker", phone: "0521234567" },
  });
  assert.equal(issued.status, 200, issued.error);
  assert.deepEqual(issued.data.vouchers.map((v) => v.serial), ["T1"]);

  // Supervisor transfer-with-link of own stock (legacy physical issuance path).
  const linked = await rpc(sup, "transfer_voucher_stock", {
    p_items: [{ amount: 100, fuel_type: "סולר", serials: ["T2"], details: REG }], p_branch: "צפון", p_supervisor: "Cohen Avi",
    p_link: { id: "3002", employee_name: "Worker Two", phone: "0521234567" },
  });
  assert.equal(linked.status, 200, linked.error);
  const t2 = await Voucher.findOne({ serial: "T2" }).lean();
  assert.equal(t2.status, STATUS.ISSUED);
  assert.equal(t2.link_id, "3002");
  assert.ok(t2.issued_at && t2.expires_at);
  assert.equal((await WorkerLink.findOne({ id: "3002" }).lean()).total, 100);
});

// ───────────── concurrency ─────────────

test("20 concurrent issuances for the last 3 cards never double-allocate", { timeout: 120_000 }, async () => {
  await seed([{ serial: "L1" }, { serial: "L2" }, { serial: "L3" }]);
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => rpc(admin, "issue_voucher_to_worker", {
    p_items: [{ amount: 100, fuel_type: "בנזין", details: REG }], p_branch: MAIN_POOL, p_supervisor: null,
    p_link: { id: String(500000 + i), employee_name: "Worker", phone: "0521234567" },
  })));
  const ok = results.filter((r) => r.status === 200);
  const failed = results.filter((r) => r.status !== 200);
  assert.equal(ok.length, 3);
  assert.ok(failed.every((r) => r.error === SHORTAGE), JSON.stringify(failed.map((r) => r.error)));
  const serials = ok.flatMap((r) => r.data.vouchers.map((v) => v.serial));
  assert.equal(new Set(serials).size, 3);
  assert.equal(await WorkerLink.countDocuments(), 3);
  const links = await WorkerLink.find().lean();
  assert.equal(new Set(links.flatMap((l) => l.serials)).size, 3);
  for (const v of await Voucher.find().lean()) {
    assert.equal(v.status, STATUS.ISSUED);
    assert.ok(links.find((l) => l.id === v.link_id && l.serials.includes(v.serial)));
  }
});

test("concurrent transfers and issuances of the same cards allocate each card once", { timeout: 120_000 }, async () => {
  await seed([{ serial: "Q1" }, { serial: "Q2" }]);
  const transfers = Array.from({ length: 10 }, (_, i) => rpc(admin, "transfer_voucher_stock", {
    p_items: [{ amount: 100, fuel_type: "בנזין", serials: ["Q1"], details: REG }], p_branch: MAIN_POOL, p_supervisor: null,
    p_link: { id: String(600000 + i), employee_name: "Worker", phone: "0521234567" },
  }));
  const issues = Array.from({ length: 10 }, (_, i) => rpc(admin, "issue_voucher_to_worker", {
    p_items: [{ amount: 100, fuel_type: "בנזין", details: REG }], p_branch: MAIN_POOL, p_supervisor: null,
    p_link: { id: String(700000 + i), employee_name: "Worker", phone: "0521234567" },
  }));
  const results = await Promise.all([...transfers, ...issues]);
  const ok = results.filter((r) => r.status === 200);
  assert.equal(ok.length, 2, JSON.stringify(results.map((r) => r.error)));
  assert.ok(results.filter((r) => r.status !== 200).every((r) => r.error === SHORTAGE));
  const links = await WorkerLink.find().lean();
  const all = links.flatMap((l) => l.serials);
  assert.equal(all.length, 2);
  assert.equal(new Set(all).size, 2);
});

// ───────────── Paz reconciliation ─────────────

test("Paz reconciliation normalizes leading zeros, is idempotent and rejects ambiguity", async () => {
  await seed([
    { serial: "019950", status: "issued" }, { serial: "019951", status: "available" },
    { serial: "019952", status: STATUS.ISSUED, link_id: "1111" }, { serial: "019953" },
    { serial: "019954", status: STATUS.BLOCKED }, { serial: "019955", status: "מומש בפועל" },
    { serial: "000123", status: STATUS.ISSUED },
  ]);
  // A legacy row without a maintained key is backfilled inside the transaction.
  await Voucher.collection.insertOne({ serial: "0456", amount: 100, status: STATUS.AVAILABLE, paz_match_key: null });

  const n = await rpc(admin, "reconcile_redeemed_vouchers", {
    card_numbers: [" 19950 ", "019950", "19951.0", "19952", "019953", "019954", "019955", "123", "456.0", 7, "missing"],
  });
  assert.equal(n.status, 200, n.error);
  assert.equal(n.data, 7);
  const redeemed = await Voucher.find({ status: STATUS.REDEEMED }).lean();
  assert.deepEqual(redeemed.map((v) => v.serial).sort(), ["000123", "019950", "019951", "019952", "019953", "019955", "0456"]);
  assert.ok(redeemed.every((v) => v.redeemed_at instanceof Date));
  assert.equal((await Voucher.findOne({ serial: "019954" }).lean()).status, STATUS.BLOCKED);
  const audit = await ActivityLog.findOne({ action: "היזון חוזר מימושים מפז" }).lean();
  assert.equal(audit.target, "7 שוברים עודכנו למומש סופית · מספרי כרטיסים: 000123, 019950, 019951, 019952, 019953, 019955, 0456");
  assert.equal(audit.details.count, 7);

  const stamp = (await Voucher.findOne({ serial: "019950" }).lean()).redeemed_at;
  const again = await rpc(admin, "reconcile_redeemed_vouchers", { card_numbers: ["19950", "019951", "000123"] });
  assert.equal(again.data, 0);
  const v = await Voucher.findOne({ serial: "019950" }).lean();
  assert.equal(v.redeemed_at.getTime(), stamp.getTime());
  assert.equal(v.serial, "019950");
  assert.equal(await ActivityLog.countDocuments({ action: "היזון חוזר מימושים מפז" }), 2);

  await seed([{ serial: "19950" }, { serial: "0777" }]);
  const amb = await rpc(admin, "reconcile_redeemed_vouchers", { card_numbers: ["19950", "777"] });
  assert.equal(amb.status, 400);
  assert.equal(amb.error, AMBIGUOUS);
  assert.equal((await Voucher.findOne({ serial: "19950" }).lean()).status, STATUS.AVAILABLE);
  assert.equal((await Voucher.findOne({ serial: "0777" }).lean()).status, STATUS.AVAILABLE); // whole batch aborted
  assert.equal(await ActivityLog.countDocuments({ action: "היזון חוזר מימושים מפז" }), 2);

  assert.equal((await rpc(admin, "reconcile_redeemed_vouchers", { card_numbers: [" ", null] })).error, "Card numbers required");
});

// ───────────── import / codes ─────────────

test("stock import never overwrites existing cards and stores codes separately", async () => {
  await seed([{ serial: "E1", amount: 200 }]);
  const r = await rpc(admin, "import_voucher_inventory", { p_rows: [
    { serial: " N1 ", real_code: " CODE1 ", amount: 100, fuel_type: "בנזין" },
    { serial: "E1", real_code: "X", amount: 100, fuel_type: "סולר" },
    { serial: "N1", real_code: "DUP", amount: 100, fuel_type: "בנזין" },
    { serial: "N2", real_code: "CODE2", amount: "100", fuel_type: "סולר" },
  ] });
  assert.equal(r.status, 200, r.error);
  assert.deepEqual(r.data, { added: 2, skipped: 2, serials: ["N1", "N2"] });
  const e1 = await Voucher.findOne({ serial: "E1" }).lean();
  assert.equal(e1.amount, 200);
  const n1 = await Voucher.findOne({ serial: "N1" }).lean();
  assert.equal(n1.real_code, "");
  assert.equal(n1.branch, MAIN_POOL);
  assert.equal(n1.status, STATUS.AVAILABLE);
  assert.equal(n1.paz_match_key, "N1");
  assert.equal((await VoucherCode.findOne({ serial: "N1" }).lean()).real_code, "CODE1");
  assert.ok(await ActivityLog.findOne({ action: "ייבוא מלאי שוברים", target: "2 נוספו, 2 כפולים דולגו" }));

  const bad = await rpc(admin, "import_voucher_inventory", { p_rows: [{ serial: "N9", real_code: "C", amount: 100, fuel_type: "בנזין" }, { serial: "N8", real_code: "C", amount: 120, fuel_type: "בנזין" }] });
  assert.equal(bad.error, "Invalid stock row");
  assert.equal(await Voucher.countDocuments({ serial: "N9" }), 0);
  assert.equal((await rpc(admin, "import_voucher_inventory", { p_rows: [{ serial: " " }] })).error, "Card number required");
  assert.equal((await rpc(admin, "import_voucher_inventory", { p_rows: [] })).error, "Invalid stock file");

  // Concurrent imports of the same card: exactly one adds it.
  const conc = await Promise.all(Array.from({ length: 6 }, () => rpc(admin, "import_voucher_inventory", { p_rows: [{ serial: "C1", real_code: "Z", amount: 100, fuel_type: "בנזין" }] })));
  assert.ok(conc.every((x) => x.status === 200), JSON.stringify(conc.map((x) => x.error)));
  assert.equal(conc.reduce((s, x) => s + x.data.added, 0), 1);
  assert.equal(await Voucher.countDocuments({ serial: "C1" }), 1);

  assert.equal((await rpc(admin, "store_voucher_codes", { p_codes: [{ serial: "NOPE", real_code: "1" }] })).error, "Voucher does not exist");
  assert.equal((await rpc(admin, "store_voucher_codes", { p_codes: [{ serial: "E1", real_code: "" }] })).error, "Card number and code are required");
  assert.equal((await rpc(admin, "store_voucher_codes", { p_codes: {} })).error, "Expected array of voucher codes");
  const st = await rpc(admin, "store_voucher_codes", { p_codes: [{ serial: "E1", real_code: "NEWCODE" }] });
  assert.equal(st.status, 200, st.error);
  const code = await VoucherCode.findOne({ serial: "E1" }).lean();
  assert.equal(code.real_code, "NEWCODE");
  assert.equal(code.redemption_code, "NEWCODE");
  assert.equal((await Voucher.findOne({ serial: "E1" }).lean()).amount, 200);
});
