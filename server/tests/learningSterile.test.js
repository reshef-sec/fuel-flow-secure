/**
 * סביבת לימוד — built from the real reference data (branches, users, issue reasons, vehicle pools)
 * and sterile: a full session of learning-mode activity leaves every real collection byte-identical.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import { LEARNING, REAL } from "../models.js";

before(startTestServer);
after(stopTestServer);
beforeEach(async () => {
  await resetDb();
  await Promise.all(Object.values(LEARNING).map((m) => m.deleteMany({})));
});

const clean = ({ _id, __v, createdAt, updatedAt, ...rest }) => rest;
/** Every real collection, sorted, minus the owner's own toggle (learning_mode) and its audit lines. */
async function snapshotReal() {
  const out = {};
  for (const [name, m] of Object.entries(REAL)) {
    let rows = (await m.find().lean()).map(clean);
    if (name === "Profile") rows = rows.map(({ learning_mode, updated_at, ...r }) => r);
    if (name === "ActivityLog") rows = rows.filter((r) => !String(r.action).includes("סביבת לימוד"));
    out[name] = rows.map((r) => JSON.stringify(r)).sort();
  }
  return out;
}

async function seedRealReference() {
  await REAL.Branch.create([
    { id: "br-n", name: "סניף צפון", manager: "מנהל צפון", city: "עכו" },
    { id: "br-s", name: "סניף דרום", manager: "מנהלת דרום", city: "אילת" },
  ]);
  const mgrN = await loginAs("branch", { fullName: "מנהל צפון", branch: "סניף צפון" });
  const mgrS = await loginAs("branch", { fullName: "מנהלת דרום", branch: "סניף דרום" });
  const supN = await loginAs("supervisor", { fullName: "מפקח צפוני", branch: "סניף צפון" });
  await REAL.AppUser.create({ email: "south@example.com", last_name: "מפקחת", first_name: "דרומית", role: "supervisor",
    phone: "0521212121", branch: "סניף דרום", can_request: true });
  await REAL.IssueReason.create([
    { id: "r1", name: "סיבת עבודה אמיתית", category: "B2B" },
    { id: "r2", name: "סיבה פרטית אמיתית", category: "Regular" },
  ]);
  await REAL.B2BClient.create([
    { id: "w1", client_code: "9001", standard: "80612345", branch: "סניף צפון", client_name: "לקוח עבודה אמיתי", is_active: true },
    { id: "w2", client_code: "9002", standard: "80654321", branch: "סניף דרום", client_name: "לקוח עבודה דרום", is_active: true },
    { id: "w3", client_code: "9003", standard: "80600000", branch: "סניף דרום", client_name: "לקוח לא פעיל", is_active: false },
  ]);
  await REAL.RegularClient.create([
    { id: "p1", client_id: "77001", client_name: "לקוח פרטי אמיתי", site_id: "1", site_name: "אתר א", is_active: true },
    { id: "p2", client_id: "77002", client_name: "לקוח פרטי נוסף", site_id: "2", site_name: "אתר ב", is_active: true },
  ]);
  await REAL.WorkerLink.create({ id: "12345678", total: 100, serials: [], employee_name: "עובד אמיתי" });
  return { mgrN, mgrS, supN };
}

describe("learning environment — real reference data, sterile", () => {
  it("copies branches, users, reasons and vehicle pools from the real system", async () => {
    const { supN } = await seedRealReference();
    const o = await loginAs("admin", { fullName: "קורן מאיה" });
    process.env.DEV_TOOLS_OWNER_EMAIL = o.email;
    assert.equal((await o.agent.post("/api/learning").send({ action: "activate" })).status, 200);

    const L = LEARNING;
    assert.deepEqual((await L.Branch.find().lean()).map((b) => b.name).sort(), ["סניף דרום", "סניף צפון"]);
    assert.deepEqual((await L.IssueReason.find().lean()).map((r) => r.name).sort(), ["סיבה פרטית אמיתית", "סיבת עבודה אמיתית"]);
    assert.deepEqual((await L.B2BClient.find().lean()).map((c) => c.standard).sort(), ["80600000", "80612345", "80654321"]);
    assert.equal((await L.B2BClient.findOne({ standard: "80600000" }).lean()).is_active, false);
    assert.equal(await L.RegularClient.countDocuments(), 2);
    const realUsers = (await REAL.AppUser.find().lean()).map((u) => u.id).sort();
    assert.deepEqual((await L.AppUser.find().lean()).map((u) => u.id).sort(), realUsers);

    // Demo activity uses only the real names, branches, reasons and vehicles.
    const vouchers = await L.Voucher.find({ route: { $ne: null } }).lean();
    assert.ok(vouchers.length > 50);
    for (const v of vouchers) {
      assert.ok(["סניף צפון", "סניף דרום"].includes(v.branch), v.branch);
      if (v.reason) assert.ok(["סיבת עבודה אמיתית", "סיבה פרטית אמיתית"].includes(v.reason), v.reason);
      if (v.route === "b2b") assert.ok(["80612345", "80654321", "80600000"].includes(v.standard));
      else assert.ok(["77001", "77002"].includes(v.client_id));
    }
    assert.ok(vouchers.some((v) => v.supervisor_id === supN.profile.id), "real supervisor appears as issuer");
    assert.equal(await L.VoucherRequest.countDocuments({ status: "ממתין לאישור" }), 4);

    // Copied logins are unusable; demo link numbers never reuse a real one.
    for (const p of await L.Profile.find().lean()) assert.ok(p.password_hash.startsWith("!learning"), p.id);
    assert.equal(await L.WorkerLink.countDocuments({ id: "12345678" }), 0);
  });

  it("a full learning-mode session leaves every real collection unchanged", async () => {
    await seedRealReference();
    const o = await loginAs("admin", { fullName: "קורן מאיה" });
    process.env.DEV_TOOLS_OWNER_EMAIL = o.email;
    const before = await snapshotReal();

    await o.agent.post("/api/learning").send({ action: "activate" });
    // Edits on every kind of record the admin can touch.
    const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
    ok(await o.agent.post("/api/db/branches").send({ op: "insert", values: { id: "demo-b", name: "סניף דמו" } }));
    ok(await o.agent.post("/api/db/branches").send({ op: "update", values: { manager: "שונה בדמו" }, filters: [{ col: "id", op: "eq", value: "br-n" }] }));
    ok(await o.agent.post("/api/db/issue_reasons").send({ op: "delete", filters: [{ col: "id", op: "eq", value: "r1" }] }));
    ok(await o.agent.post("/api/db/app_users").send({ op: "delete", filters: [{ col: "email", op: "eq", value: "south@example.com" }] }));
    const sync = await rpc(o.agent, "sync_work_vehicles", { p_rows: [{ standard: "80699999", client_code: "1", client_name: "חדש בדמו" }] });
    assert.equal(sync.status, 200, JSON.stringify(sync.error));
    await rpc(o.agent, "sync_private_vehicles", { p_rows: [{ client_id: "1", site_id: "1", client_name: "דמו" }] });
    const acc = await o.agent.post("/api/accounts").send({ action: "reset", id: "demo-account", email: "demo@example.com", phone: "0531313131", role: "supervisor", fullName: "חשבון דמו" });
    assert.equal(acc.status, 200, JSON.stringify(acc.body));
    const pending = await LEARNING.VoucherRequest.findOne({ status: "ממתין לאישור" }).lean();
    ok(await o.agent.post("/api/db/voucher_requests").send({ op: "update", values: { status: "נדחה" }, filters: [{ col: "id", op: "eq", value: pending.id }] }));
    await o.agent.post("/api/learning").send({ action: "reset" });
    await o.agent.post("/api/learning").send({ action: "pause" });

    assert.deepEqual(await snapshotReal(), before, "real data must be untouched");
    // The account created in the demo cannot sign in to the real system.
    const login = await anon().post("/api/auth/login").send({ identifier: "demo@example.com", password: acc.body.temporaryPassword });
    assert.notEqual(login.status, 200);
  });

  it("the role preview acts as the demo branch manager, on demo data only", async () => {
    const { mgrN } = await seedRealReference();
    const o = await loginAs("admin", { fullName: "קורן מאיה" });
    process.env.DEV_TOOLS_OWNER_EMAIL = o.email;
    await o.agent.post("/api/learning").send({ action: "activate" });
    const before = await snapshotReal();

    const card = await LEARNING.Voucher.findOne({ branch: "סניף צפון", supervisor: null, status: "טרם שומש", fuel_type: "בנזין", amount: 100 }).lean();
    assert.ok(card);
    const items = [{ amount: 100, fuel_type: "בנזין", serials: [card.serial] }];
    const params = { p_items: items, p_branch: "סניף צפון", p_supervisor: "צפוני מפקח" };

    // Without the preview the owner is the admin, who may only move central-pool cards.
    assert.equal((await rpc(o.agent, "transfer_voucher_stock", params)).status, 400);
    const r = await o.agent.post("/api/rpc/transfer_voucher_stock").set("X-Learning-Persona", mgrN.profile.id).send(params);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await LEARNING.Voucher.findOne({ serial: card.serial }).lean()).supervisor, "צפוני מפקח");
    assert.deepEqual(await snapshotReal(), before, "real data must be untouched");

    // Nobody else can use the header: an ordinary admin stays an admin, on real data.
    const other = await loginAs("admin");
    const stranger = await other.agent.post("/api/rpc/transfer_voucher_stock").set("X-Learning-Persona", mgrN.profile.id).send(params);
    assert.equal(stranger.status, 400);
    assert.equal(await LEARNING.ActivityLog.countDocuments({ user_id: other.profile.id }), 0);
  });
});
