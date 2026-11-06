import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import {
  ActivityLog, AppSetting, AppUser, B2BClient, Branch, Profile, RegularClient, Voucher, WorkerLink,
} from "../models.js";
import { isValidDenomination } from "../lib/canonical.js";

const OWNER_EMAIL = "owner@example.com";
const CONFIRM = "איפוס וניקוי נתונים";

before(startTestServer);
after(async () => {
  delete process.env.DEV_TOOLS_OWNER_EMAIL;
  await stopTestServer();
});
beforeEach(async () => {
  await resetDb();
  process.env.DEV_TOOLS_OWNER_EMAIL = OWNER_EMAIL;
});

const owner = () => loginAs("admin", { email: OWNER_EMAIL, fullName: "מאיה קורן" });

describe("can_use_development_tools", () => {
  it("is true only for the pinned owner admin, false for everyone else", async () => {
    assert.equal((await rpc((await owner()).agent, "can_use_development_tools")).data, true);
    assert.equal((await rpc((await loginAs("admin", { fullName: "מאיה קורן" })).agent, "can_use_development_tools")).data, false,
      "name spoofing must not grant access");
    for (const role of ["branch", "supervisor", "viewer"]) {
      assert.equal((await rpc((await loginAs(role)).agent, "can_use_development_tools")).data, false, role);
    }
    assert.equal((await rpc(anon(), "can_use_development_tools")).data, false);
  });

  it("fails closed when the owner is not configured", async () => {
    const o = await owner();
    delete process.env.DEV_TOOLS_OWNER_EMAIL;
    assert.equal((await rpc(o.agent, "can_use_development_tools")).data, false);
    assert.equal((await rpc(o.agent, "generate_demo_data")).status, 403);
  });
});

describe("generate_demo_data", () => {
  it("creates petrol 50 / diesel 100 cards per pool for the owner only", async () => {
    await Branch.create([{ id: "b1", name: "חיפה" }, { id: "b2", name: "  " }, { id: "b3", name: "אילת" }]);
    for (const role of ["admin", "branch", "supervisor", "viewer"]) {
      const r = await rpc((await loginAs(role)).agent, "generate_demo_data");
      assert.equal(r.status, 403, role);
      if (role !== "viewer") assert.equal(r.error, "אין הרשאה לכלי פיתוח ובדיקות");
    }
    assert.equal(await Voucher.countDocuments(), 0);

    const o = await owner();
    const r = await rpc(o.agent, "generate_demo_data");
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual(r.data, { vouchers_created: 60 }); // 3 pools × 2 fuels × 10
    const cards = await Voucher.find().lean();
    assert.equal(cards.length, 60);
    for (const c of cards) {
      assert.ok(isValidDenomination(c.fuel_type, c.amount), `${c.fuel_type} ${c.amount}`);
      assert.equal(c.status, "טרם שומש");
      assert.match(c.serial, /^DEMO-/);
    }
    assert.deepEqual([...new Set(cards.map((c) => c.branch))].sort(), ["אילת", "חיפה", "מאגר ראשי"].sort());
    const main = cards.filter((c) => c.branch === "מאגר ראשי");
    assert.equal(main.filter((c) => c.fuel_type === "בנזין").reduce((s, c) => s + c.amount, 0), 500);
    assert.equal(main.filter((c) => c.fuel_type === "סולר").reduce((s, c) => s + c.amount, 0), 1000);
    assert.ok(await ActivityLog.exists({ action: "טעינת נתוני הדגמה", target: "60 שוברים לבדיקה בלבד" }));

    const again = await rpc(o.agent, "generate_demo_data");
    assert.equal(again.status, 400);
    assert.equal(again.error, "טעינת הדגמה אפשרית רק כשנתוני הפעילות ריקים");
    assert.equal(await Voucher.countDocuments(), 60);
  });
});

describe("reset_development_data", () => {
  it("requires the owner and the exact typed confirmation; preserves master data", async () => {
    await Branch.create({ id: "b1", name: "חיפה" });
    await B2BClient.create({ client_code: "C1", standard: "1" });
    await RegularClient.create({ client_id: "1", site_id: "1" });
    await Voucher.create({ serial: "X1", amount: 100 });
    await WorkerLink.create({ id: "123456", serials: ["X1"] });
    await AppSetting.updateOne({ key: "main" }, { $set: { balance: 5000 } });

    for (const role of ["admin", "branch", "supervisor", "viewer"]) {
      const r = await rpc((await loginAs(role)).agent, "reset_development_data", { p_confirmation: CONFIRM });
      assert.equal(r.status, 403, role);
    }
    const o = await owner();
    for (const bad of ["", "איפוס", ` ${CONFIRM}`, null]) {
      const r = await rpc(o.agent, "reset_development_data", { p_confirmation: bad });
      assert.equal(r.status, 400);
      assert.equal(r.error, "נדרש אישור מפורש למחיקה");
    }
    assert.equal(await Voucher.countDocuments(), 1);

    const r = await rpc(o.agent, "reset_development_data", { p_confirmation: CONFIRM });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.data, null);
    assert.equal(await Voucher.countDocuments(), 0);
    assert.equal(await WorkerLink.countDocuments(), 0);
    assert.equal(await ActivityLog.countDocuments(), 0);
    assert.equal((await AppSetting.findOne({ key: "main" }).lean()).balance, 0);
    assert.equal(await Branch.countDocuments(), 1);
    assert.equal(await B2BClient.countDocuments(), 1);
    assert.equal(await RegularClient.countDocuments(), 1);
    assert.ok(await Profile.countDocuments() >= 5);
    assert.ok(await AppUser.countDocuments() >= 5);
  });

  it("reset_demo_data stays disabled", async () => {
    assert.equal((await rpc((await loginAs("admin")).agent, "reset_demo_data")).status, 403);
    const r = await rpc((await owner()).agent, "reset_demo_data");
    assert.equal(r.status, 400);
    assert.equal(r.error, "Use reset_development_data with explicit confirmation");
  });

  it("lock_development_transactions is not callable from clients", async () => {
    assert.equal((await rpc((await owner()).agent, "lock_development_transactions")).status, 404);
  });
});
