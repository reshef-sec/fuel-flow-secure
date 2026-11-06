/** Public employee endpoints under load: cached status, safe invalidation, unique indexes, separate limits. */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import { LEARNING, REAL } from "../models.js";
import { createApp } from "../app.js";

before(startTestServer);
after(stopTestServer);
beforeEach(async () => {
  await resetDb();
  await LEARNING.WorkerLink.deleteMany({});
});

const SIG = "data:image/png;base64,AAAA";
const makeLink = async (id = "555111") => {
  await REAL.Voucher.create({ serial: "C1", amount: 100, fuel_type: "בנזין", status: "הוקצה לעובד", link_id: id });
  await REAL.VoucherCode.create({ serial: "C1", real_code: "SECRET-1" });
  await REAL.WorkerLink.create({ id, total: 100, serials: ["C1"], employee_name: "עובד", created_at: new Date() });
};
/** Changes the stored link behind the app's back: the app only sees it if it reads the database. */
const rawUpdate = (id, set) => mongoose.connection.collection("worker_links").updateOne({ id }, { $set: set });
const status = async (id, extra = {}) => (await rpc(anon(), "worker_link_status", { p_id: id, ...extra })).data;

describe("public link status cache", () => {
  it("serves a repeat read without the database", async () => {
    await makeLink();
    assert.equal((await status("555111")).total, 100);
    await rawUpdate("555111", { total: 999 });
    assert.equal((await status("555111")).total, 100, "second read came from the cache");
  });

  it("drops the entry on any write, so a signature or lock shows immediately", async () => {
    await makeLink();
    assert.equal((await status("555111")).signed, false);
    const who = { p_id: "555111", p_worker_id: "123456789", p_phone: "0521234567" };
    const s = await rpc(anon(), "sign_worker_link", { ...who, p_full_name: "עובד", p_signature: SIG });
    assert.equal(s.data.ok, true);
    assert.equal((await status("555111")).signed, true);

    for (let i = 0; i < 3; i += 1) await rpc(anon(), "open_worker_wallet", { ...who, p_phone: "0500000000" });
    assert.equal((await status("555111")).state, "locked");
    const { agent } = await loginAs("admin");
    assert.equal((await rpc(agent, "unlock_worker_link", { p_id: "555111" })).status, 200);
    assert.equal((await status("555111")).state, "ok");
  });

  it("keeps real and demo links apart, and holds no codes or identity", async () => {
    await makeLink();
    await LEARNING.WorkerLink.create({ id: "555111", total: 700, serials: [], employee_name: "דמו", created_at: new Date() });
    assert.equal((await status("555111")).total, 100);
    assert.equal((await status("555111", { p_demo: true })).total, 700);
    assert.equal((await status("555111")).total, 100);
    assert.equal(JSON.stringify(await status("555111")).includes("SECRET-1"), false);
  });

  it("the wallet still needs the right person after the status was cached", async () => {
    await makeLink();
    const who = { p_id: "555111", p_worker_id: "123456789", p_phone: "0521234567" };
    await rpc(anon(), "sign_worker_link", { ...who, p_full_name: "עובד", p_signature: SIG });
    await status("555111");
    assert.equal((await rpc(anon(), "open_worker_wallet", { ...who, p_worker_id: "111111111" })).data.ok, false);
    const fine = await rpc(anon(), "open_worker_wallet", who);
    assert.equal(fine.data.ok, true);
    assert.equal((await REAL.WorkerLink.findOne({ id: "555111" }).lean()).failed_attempts, 0, "a correct visit clears failed attempts");
  });
});

describe("indexes", () => {
  it("token and card lookups use unique indexes", async () => {
    const unique = async (m, key) => (await m.collection.indexes()).some((i) => i.unique && Object.keys(i.key).join() === key);
    assert.equal(await unique(REAL.WorkerLink, "id"), true);
    assert.equal(await unique(REAL.Voucher, "serial"), true);
    assert.equal(await unique(REAL.VoucherCode, "serial"), true);
  });
});

describe("rate limits", () => {
  const app = (limits) => createApp({ staticDir: "/nonexistent", rateLimits: limits });
  const pub = (a) => request(a).post("/api/rpc/worker_link_status").send({ p_id: "555111" });

  it("a flood on employee links does not limit the management API", async () => {
    const a = app({ publicPerMin: 2, internalPerMin: 100 });
    assert.equal((await pub(a)).status, 200);
    assert.equal((await pub(a)).status, 200);
    const blocked = await pub(a);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, "rate_limited");
    assert.notEqual((await request(a).get("/api/auth/me")).status, 429);
  });

  it("management traffic does not limit employee links", async () => {
    const a = app({ publicPerMin: 100, internalPerMin: 1 });
    assert.notEqual((await request(a).get("/api/auth/me")).status, 429);
    assert.equal((await request(a).get("/api/auth/me")).status, 429);
    assert.equal((await pub(a)).status, 200);
  });
});
