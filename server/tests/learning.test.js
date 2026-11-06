/**
 * סביבת לימוד — owner-only toggle and strict isolation between real and learning data.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import mongoose from "mongoose";
import { LEARNING, REAL } from "../models.js";
import { SEED_VERSION } from "../lib/learningSeed.js";

before(startTestServer);
after(stopTestServer);
beforeEach(async () => {
  await resetDb();
  await Promise.all(Object.values(LEARNING).map((m) => m.deleteMany({})));
});

async function owner() {
  const o = await loginAs("admin", { fullName: "קורן מאיה" });
  process.env.DEV_TOOLS_OWNER_EMAIL = o.email;
  return o;
}
const serials = async (agent) => ((await agent.post("/api/db/vouchers").send({ op: "select" })).body.data ?? []).map((v) => v.serial).sort();

describe("learning environment", () => {
  it("is owner-only", async () => {
    await owner();
    for (const role of ["admin", "branch", "supervisor", "viewer"]) {
      const { agent } = await loginAs(role, { branch: "חיפה" });
      assert.equal((await agent.get("/api/learning")).status, 403, role);
      assert.equal((await agent.post("/api/learning").send({ action: "activate" })).status, 403, role);
    }
    assert.equal((await anon().get("/api/learning")).status, 401);
  });

  it("activate/pause switches the owner between learning and real data; nobody else is affected", async () => {
    const o = await owner();
    const other = await loginAs("admin");
    await REAL.Voucher.create({ serial: "REAL-1", amount: 100 });
    await LEARNING.Voucher.create({ serial: "DEMO-1", amount: 500 });
    // Mark the learning copy as current, so activation keeps it instead of re-seeding.
    await mongoose.connection.collection("learning_meta").updateOne({ _id: "seed" }, { $set: { version: SEED_VERSION } }, { upsert: true });

    assert.deepEqual(await serials(o.agent), ["REAL-1"]);
    let r = await o.agent.post("/api/learning").send({ action: "activate" });
    assert.equal(r.status, 200);
    assert.equal(r.body.active, true);
    assert.equal((await o.agent.get("/api/auth/me")).body.profile.learning_mode, true);

    // Owner now sees only learning data; another admin still sees only real data.
    assert.deepEqual(await serials(o.agent), ["DEMO-1"]);
    assert.deepEqual(await serials(other.agent), ["REAL-1"]);
    assert.equal((await other.agent.get("/api/auth/me")).body.profile.learning_mode, false);

    // Writes in learning mode never reach the real collections.
    await o.agent.post("/api/db/branches").send({ op: "insert", values: { id: "demo-b", name: "סניף דמו" } });
    assert.equal(await REAL.Branch.countDocuments({ id: "demo-b" }), 0);
    assert.equal(await LEARNING.Branch.countDocuments({ id: "demo-b" }), 1);

    r = await o.agent.post("/api/learning").send({ action: "pause" });
    assert.equal(r.body.active, false);
    assert.deepEqual(await serials(o.agent), ["REAL-1"]);
    // Paused data is kept for the next activation.
    assert.equal(await LEARNING.Voucher.countDocuments({ serial: "DEMO-1" }), 1);
  });

  it("a non-owner admin with a stale learning flag is never routed to learning data", async () => {
    const o = await owner();
    const other = await loginAs("admin");
    await REAL.Profile.updateOne({ id: other.profile.id }, { $set: { learning_mode: true } });
    await REAL.Voucher.create({ serial: "REAL-1", amount: 100 });
    await LEARNING.Voucher.create({ serial: "DEMO-1", amount: 500 });
    assert.deepEqual(await serials(other.agent), ["REAL-1"]);
    assert.ok(o);
  });

  it("demo worker links open only against learning data (p_demo)", async () => {
    await LEARNING.WorkerLink.create({ id: "777777", total: 100, serials: [], employee_name: "עובד דמו" });
    const a = anon();
    assert.equal((await rpc(a, "worker_link_status", { p_id: "777777" })).data.exists, false);
    const demo = await rpc(a, "worker_link_status", { p_id: "777777", p_demo: true });
    assert.equal(demo.data.exists, true);
    // p_demo is honoured only for the public employee-page functions.
    const { agent } = await loginAs("admin");
    await REAL.Voucher.create({ serial: "REAL-1", amount: 100 });
    const snap = await rpc(agent, "get_central_inventory_snapshot", { p_demo: true });
    assert.equal(snap.status, 200);
    assert.equal(await LEARNING.Voucher.countDocuments({ serial: "REAL-1" }), 0);
  });
});
