import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, anon } from "./helpers.js";
import { AppUser, Profile, Voucher, ActivityLog } from "../models.js";

before(startTestServer);
after(stopTestServer);
beforeEach(resetDb);

describe("QA Test A — first login forces a password change", () => {
  it("a temporary password blocks every module until it is changed", async () => {
    const admin = await loginAs("admin");
    const user = await AppUser.create({ email: "dana@example.com", first_name: "דנה", last_name: "לוי", role: "supervisor", phone: "0521234567", branch: "חיפה" });
    const reset = await admin.agent.post("/api/accounts").send({ action: "reset", id: user.id, email: user.email, phone: user.phone, fullName: "לוי דנה", role: "supervisor", branch: "חיפה" });
    assert.equal(reset.status, 200);
    const temporary = reset.body.temporaryPassword;
    const a = anon();

    const login = await a.post("/api/auth/login").send({ identifier: "052-123-4567", password: temporary });
    assert.equal(login.status, 200);
    assert.equal(login.body.profile.requires_password_change, true);
    assert.equal(login.body.profile.is_first_login, true);

    // Every business endpoint is locked until the change.
    for (const [path, body] of [["/api/db/vouchers", { op: "select" }], ["/api/rpc/get_central_inventory_snapshot", {}]]) {
      const r = await a.post(path).send(body);
      assert.equal(r.status, 403, path);
    }
    assert.equal((await a.get("/api/notifications?since=2020-01-01")).status, 403);

    // Non-compliant passwords are rejected.
    for (const pw of ["short1", "onlyletters", "12345678", "0521234567"]) {
      assert.equal((await a.post("/api/auth/change-password").send({ password: pw })).status, 400, pw);
    }
    const ok = await a.post("/api/auth/change-password").send({ password: "Delek2026x" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.profile.requires_password_change, false);
    assert.equal((await AppUser.findOne({ id: user.id })).requires_password_change, false);

    // Now the modules open, and the old initial password no longer works.
    assert.equal((await a.post("/api/db/vouchers").send({ op: "select" })).status, 200);
    assert.equal((await anon().post("/api/auth/login").send({ identifier: "dana@example.com", password: temporary })).status, 401);
    assert.equal((await anon().post("/api/auth/login").send({ identifier: "dana@example.com", password: "Delek2026x" })).status, 200);
  });

  it("rejects wrong credentials and locks after 5 failures", async () => {
    const { email } = await loginAs("supervisor");
    for (let i = 0; i < 5; i += 1) assert.equal((await anon().post("/api/auth/login").send({ identifier: email, password: "wrong" })).status, 401);
    assert.equal((await anon().post("/api/auth/login").send({ identifier: email, password: "Passw0rd!" })).status, 429);
  });

  it("old sessions die after a password reset by an admin", async () => {
    const admin = await loginAs("admin");
    const sup = await loginAs("supervisor", { branch: "חיפה" });
    assert.equal((await sup.agent.get("/api/auth/me")).body.profile.role, "supervisor");
    const r = await admin.agent.post("/api/accounts").send({ action: "reset", id: sup.profile.id, email: sup.email, phone: sup.phone, role: "supervisor", branch: "חיפה" });
    assert.equal(r.status, 200);
    assert.equal((await sup.agent.get("/api/auth/me")).body.profile, null);
  });

  it("bootstrap is only possible while no admin exists", async () => {
    const a = anon();
    assert.equal((await a.post("/api/rpc/needs_setup").send({})).body.data, true);
    assert.equal((await a.post("/api/accounts").send({ action: "bootstrap", email: "maya@example.com", password: "Passw0rd1", fullName: "מאיה קורן" })).status, 200);
    assert.equal((await a.post("/api/rpc/needs_setup").send({})).body.data, false);
    assert.equal((await a.post("/api/accounts").send({ action: "bootstrap", email: "x@example.com", password: "Passw0rd1", fullName: "x" })).status, 403);
  });

  it("rejects cross-origin and non-JSON writes", async () => {
    const { agent } = await loginAs("admin");
    assert.equal((await agent.post("/api/db/vouchers").set("Origin", "https://evil.example").send({ op: "select" })).status, 403);
    assert.equal((await agent.post("/api/db/vouchers").type("form").send("op=select")).status, 415);
  });
});

describe("RBAC + branch isolation (table API)", () => {
  beforeEach(async () => {
    await Voucher.create([
      { serial: "H1", amount: 100, branch: "חיפה", status: "טרם שומש" },
      { serial: "T1", amount: 100, branch: "תל אביב", status: "טרם שומש" },
      { serial: "M1", amount: 100, branch: "מאגר ראשי", status: "טרם שומש", real_code: "SECRET" },
    ]);
  });

  const serials = (r) => r.body.data.map((x) => x.serial).sort();

  it("admin sees everything but never redemption codes", async () => {
    const { agent } = await loginAs("admin");
    const r = await agent.post("/api/db/vouchers").send({ op: "select" });
    assert.deepEqual(serials(r), ["H1", "M1", "T1"]);
    assert.ok(r.body.data.every((v) => !("real_code" in v)));
  });

  it("branch manager only sees own branch and cannot touch another branch", async () => {
    const { agent } = await loginAs("branch", { branch: "חיפה" });
    assert.deepEqual(serials(await agent.post("/api/db/vouchers").send({ op: "select" })), ["H1"]);
    await agent.post("/api/db/vouchers").send({ op: "update", values: { status: "חסום" }, filters: [{ col: "serial", op: "eq", value: "T1" }] });
    assert.equal((await Voucher.findOne({ serial: "T1" })).status, "טרם שומש");
    const moveOut = await agent.post("/api/db/vouchers").send({ op: "update", values: { branch: "תל אביב" }, filters: [{ col: "serial", op: "eq", value: "H1" }] });
    assert.equal(moveOut.status, 403);
    const forged = await agent.post("/api/db/vouchers").send({ op: "insert", values: { serial: "X1", branch: "תל אביב" } });
    assert.equal(forged.status, 403);
  });

  it("supervisor only sees cards assigned to them", async () => {
    const { agent, profile } = await loginAs("supervisor", { branch: "חיפה" });
    await Voucher.updateOne({ serial: "H1" }, { supervisor_id: profile.id });
    assert.deepEqual(serials(await agent.post("/api/db/vouchers").send({ op: "select" })), ["H1"]);
  });

  it("viewer reads but cannot write", async () => {
    const { agent } = await loginAs("viewer");
    assert.equal((await agent.post("/api/db/vouchers").send({ op: "select" })).body.data.length, 3);
    assert.equal((await agent.post("/api/db/branches").send({ op: "insert", values: { id: "b1", name: "x" } })).status, 403);
    assert.equal((await agent.post("/api/db/voucher_requests").send({ op: "insert", values: { id: "r1" } })).status, 403);
  });

  it("only admins write settings tables and read the audit log", async () => {
    const sup = await loginAs("supervisor", { branch: "חיפה" });
    assert.equal((await sup.agent.post("/api/db/app_users").send({ op: "update", values: { role: "admin" }, filters: [{ col: "id", op: "eq", value: sup.profile.id }] })).status, 403);
    assert.equal((await sup.agent.post("/api/db/activity_log").send({ op: "select" })).status, 403);
    // Supervisors may append audit entries, always stamped with their own id.
    await sup.agent.post("/api/db/activity_log").send({ op: "insert", values: { action: "x", user_id: "someone-else" } });
    assert.equal((await ActivityLog.findOne({ action: "x" })).user_id, sup.profile.id);
  });

  it("anonymous callers get nothing", async () => {
    assert.equal((await anon().post("/api/db/vouchers").send({ op: "select" })).status, 401);
    assert.equal((await anon().post("/api/db/app_users").send({ op: "select" })).status, 401);
  });

  it("profiles/voucher_codes are not reachable through the table API", async () => {
    const { agent } = await loginAs("admin");
    assert.equal((await agent.post("/api/db/profiles").send({ op: "select" })).status, 403);
    assert.equal((await agent.post("/api/db/voucher_codes").send({ op: "select" })).status, 403);
    assert.ok(await Profile.countDocuments() > 0);
  });
});
