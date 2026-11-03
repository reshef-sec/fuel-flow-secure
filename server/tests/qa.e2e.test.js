/**
 * QA verification suite — the four acceptance scenarios of the migration.
 *   A: first-time login → forced password change
 *   B: concurrent allocation → zero duplicates
 *   C: work/private vehicle Excel sync with one omitted row → "לא פעיל"
 *   D: Paz reconciliation upload → "מומש סופית"
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import { AppUser, Voucher, B2BClient, RegularClient } from "../models.js";

before(startTestServer);
after(stopTestServer);
beforeEach(resetDb);

const PETROL = "בנזין";
const DIESEL = "סולר";

describe("QA", () => {
  it("Test A — first-time user is forced to change password before any module", async () => {
    await AppUser.create({ national_id: "314159265", first_name: "יוסי", last_name: "כהן", role: "branch", phone: "0549876543", branch: "חיפה" });
    const a = anon();
    const login = await a.post("/api/auth/login").send({ phone: "0549876543", password: "314159265" });
    assert.equal(login.status, 200);
    assert.equal(login.body.profile.is_first_login, true);
    assert.equal((await a.post("/api/db/vouchers").send({ op: "select" })).status, 403);
    assert.equal((await rpc(a, "issue_voucher_to_worker", {})).status, 403);
    assert.equal((await a.post("/api/auth/change-password").send({ password: "Reshef2026" })).status, 200);
    assert.equal((await a.post("/api/db/vouchers").send({ op: "select" })).status, 200);
  });

  it("Test B — concurrent allocation never issues a card twice", async () => {
    const { agent } = await loginAs("admin");
    await Voucher.create([1, 2, 3, 4].map((i) => ({ serial: `C${i}`, amount: 100, fuel_type: PETROL, branch: "מאגר ראשי", status: "טרם שומש" })));
    await RegularClient.create({ client_id: "77", site_id: "1", client_name: "לקוח", site_name: "אתר", is_active: true });
    const attempts = Array.from({ length: 25 }, (_, i) => rpc(agent, "issue_voucher_to_worker", {
      p_items: [{ amount: 100, fuel_type: PETROL, details: { route: "regular", client_id: "77", site_id: "1" } }],
      p_branch: "מאגר ראשי", p_supervisor: null,
      p_link: { id: String(10000 + i), employee_name: `עובד ${i}` },
    }));
    const results = await Promise.all(attempts);
    const ok = results.filter((r) => r.status === 200);
    assert.equal(ok.length, 4, "exactly the 4 available cards are issued");
    const serials = ok.flatMap((r) => r.data.vouchers.map((v) => v.serial));
    assert.equal(new Set(serials).size, serials.length, "no duplicate card");
    const issued = await Voucher.find({ status: "הוקצה לעובד" }).lean();
    assert.equal(issued.length, 4);
    assert.equal(new Set(issued.map((v) => v.link_id)).size, 4, "each card belongs to exactly one link");
    // Denomination rules are enforced server-side.
    const bad = await rpc(agent, "issue_voucher_to_worker", { p_items: [{ amount: 150, fuel_type: PETROL }], p_branch: "מאגר ראשי", p_link: { id: "99999", employee_name: "x" } });
    assert.notEqual(bad.status, 200);
    const badDiesel = await rpc(agent, "issue_voucher_to_worker", { p_items: [{ amount: 75, fuel_type: DIESEL }], p_branch: "מאגר ראשי", p_link: { id: "99998", employee_name: "x" } });
    assert.notEqual(badDiesel.status, 200);
  });

  it("Test C — vehicle sync with one omitted row marks it inactive (never deleted) and hides it from issuance", async () => {
    const { agent } = await loginAs("admin");
    const row = (standard, code) => ({ client_code: code, account_name: `חשבון ${code}`, client_name: `לקוח ${code}`, branch: "חיפה", standard, is_active: true });
    const first = await rpc(agent, "sync_work_vehicles", { p_rows: [row("80620031", "1"), row("80620032", "2"), row("80620033", "3"), {}, {}] });
    assert.equal(first.status, 200, JSON.stringify(first));
    assert.equal(await B2BClient.countDocuments({ is_active: true }), 3);

    const second = await rpc(agent, "sync_work_vehicles", { p_rows: [row("80620031", "1"), row("80620033", "3")] });
    assert.equal(second.status, 200);
    assert.equal(second.data.deactivated, 1);
    const omitted = await B2BClient.findOne({ standard: "80620032" }).lean();
    assert.ok(omitted, "record kept for history");
    assert.equal(omitted.is_active, false);

    // Private vehicles: composite key client_id + site_id.
    const prow = (c, s) => ({ client_id: c, site_id: s, client_name: `ל${c}`, site_name: `א${s}`, is_active: true });
    assert.equal((await rpc(agent, "sync_private_vehicles", { p_rows: [prow("5", "1"), prow("5", "2")] })).status, 200);
    const p2 = await rpc(agent, "sync_private_vehicles", { p_rows: [prow("5", "1")] });
    assert.equal(p2.data.deactivated, 1);
    assert.equal((await RegularClient.findOne({ client_id: "5", site_id: "2" }).lean()).is_active, false);

    // Inactive vehicle cannot receive a voucher.
    await Voucher.create({ serial: "V1", amount: 100, fuel_type: PETROL, branch: "מאגר ראשי", status: "טרם שומש" });
    const blocked = await rpc(agent, "issue_voucher_to_worker", {
      p_items: [{ amount: 100, fuel_type: PETROL, details: { route: "regular", client_id: "5", site_id: "2" } }],
      p_branch: "מאגר ראשי", p_link: { id: "55555", employee_name: "x" },
    });
    assert.notEqual(blocked.status, 200);
    assert.equal((await Voucher.findOne({ serial: "V1" })).status, "טרם שומש");

    // Empty file never mass-deactivates.
    assert.notEqual((await rpc(agent, "sync_work_vehicles", { p_rows: [{}, {}] })).status, 200);
    assert.equal(await B2BClient.countDocuments({ is_active: true }), 2);
  });

  it("Test D — Paz upload marks issued and available cards 'מומש סופית'", async () => {
    const { agent } = await loginAs("admin");
    await Voucher.create([
      { serial: "000123", amount: 100, fuel_type: PETROL, status: "הוקצה לעובד" },
      { serial: "456", amount: 50, fuel_type: DIESEL, status: "טרם שומש" },
      { serial: "789", amount: 100, fuel_type: PETROL, status: "טרם שומש" },
    ]);
    const r = await rpc(agent, "reconcile_redeemed_vouchers", { card_numbers: ["123", "456.0", " 0999 "] });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.data, 2);
    const byserial = Object.fromEntries((await Voucher.find().lean()).map((v) => [v.serial, v]));
    assert.equal(byserialStatus(byserial, "000123"), "מומש סופית");
    assert.equal(byserialStatus(byserial, "456"), "מומש סופית");
    assert.equal(byserialStatus(byserial, "789"), "טרם שומש");
    assert.ok(byserial["000123"].redeemed_at);
    assert.equal(byserial["000123"].serial, "000123", "stored card number keeps its leading zeros");
    // Non-admins cannot reconcile.
    const sup = await loginAs("supervisor", { branch: "חיפה" });
    assert.notEqual((await rpc(sup.agent, "reconcile_redeemed_vouchers", { card_numbers: ["789"] })).status, 200);
  });
});

function byserialStatus(map, serial) {
  return map[serial]?.status;
}
