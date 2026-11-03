import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import { SignatureArchive, Voucher, VoucherCode, WorkerLink } from "../models.js";
import { addMonths } from "../rpc/workerLinks.js";

before(startTestServer);
after(stopTestServer);
beforeEach(resetDb);

const SIG = "data:image/png;base64,iVBORw0KGgo=";

async function seedLink({ id = "123456", supervisorId = null, signed = false, createdAt } = {}) {
  await Voucher.create([
    { serial: "S1", real_code: "fallback-1", amount: 100, fuel_type: "בנזין", status: "הוקצה לעובד", link_id: id },
    { serial: "S2", real_code: "fallback-2", amount: 50, fuel_type: "סולר", status: "הוקצה לעובד", link_id: id },
    { serial: "S3", real_code: "blocked", amount: 100, fuel_type: "בנזין", status: "חסום", link_id: id },
  ]);
  await VoucherCode.create({ serial: "S1", real_code: "REAL-1" });
  await WorkerLink.create({
    id, total: 250, serials: ["S1", "S2", "S3"], created_on: "2026-01-01", employee_name: "יוסי כהן",
    branch: "חיפה", supervisor_id: supervisorId,
    ...(signed ? { worker_id: "123456789", phone: "0521234567", signed_at: "2026-01-01" } : {}),
  });
  if (createdAt) await WorkerLink.collection.updateOne({ id }, { $set: { created_at: createdAt } });
}

describe("worker_link_status", () => {
  it("reveals only status, total and name — never codes", async () => {
    await seedLink();
    const a = anon();
    assert.deepEqual((await rpc(a, "worker_link_status", { p_id: "123456" })).data,
      { exists: true, state: "ok", total: 250, signed: false, employee_name: "יוסי כהן" });
    assert.deepEqual((await rpc(a, "worker_link_status", { p_id: "999999" })).data, { exists: false });
    assert.deepEqual((await rpc(a, "worker_link_status", { p_id: "abc" })).data, { exists: false });
    assert.deepEqual((await rpc(a, "worker_link_status", { p_id: { $ne: null } })).data, { exists: false });
  });

  it("reports expired links after 3 months", async () => {
    await seedLink({ createdAt: addMonths(new Date(), -4) });
    assert.deepEqual((await rpc(anon(), "worker_link_status", { p_id: "123456" })).data, { exists: true, state: "expired" });
    assert.deepEqual((await rpc(anon(), "open_worker_wallet", { p_id: "123456", p_worker_id: "123456789", p_phone: "0521234567" })).data,
      { ok: false, state: "expired" });
    const s = await rpc(anon(), "sign_worker_link", { p_id: "123456", p_worker_id: "123456789", p_phone: "0521234567", p_full_name: "יוסי כהן", p_signature: SIG });
    assert.deepEqual(s.data, { ok: false });
  });

  it("addMonths clamps to month end like Postgres", () => {
    assert.equal(addMonths(new Date("2026-01-31T10:00:00Z"), 3).toISOString(), "2026-04-30T10:00:00.000Z");
    assert.equal(addMonths(new Date("2026-11-15T00:00:00Z"), 3).toISOString(), "2027-02-15T00:00:00.000Z");
  });
});

describe("sign_worker_link + open_worker_wallet", () => {
  it("signs once, archives the signature, then opens only for the matching id + phone", async () => {
    await seedLink();
    const a = anon();
    // Invalid payloads are rejected without side effects.
    for (const bad of [
      { p_worker_id: "12345678", p_phone: "0521234567", p_full_name: "יוסי", p_signature: SIG },
      { p_worker_id: "123456789", p_phone: "521234567", p_full_name: "יוסי", p_signature: SIG },
      { p_worker_id: "123456789", p_phone: "0521234567", p_full_name: " י ", p_signature: SIG },
      { p_worker_id: "123456789", p_phone: "0521234567", p_full_name: "יוסי", p_signature: "data:image/jpeg;base64,x" },
    ]) assert.deepEqual((await rpc(a, "sign_worker_link", { p_id: "123456", ...bad })).data, { ok: false });

    // Unsigned link cannot be opened with empty credentials.
    const empty = await rpc(a, "open_worker_wallet", { p_id: "123456", p_worker_id: null, p_phone: null });
    assert.equal(empty.data.ok, false);
    assert.equal(empty.data.codes, undefined);
    await WorkerLink.updateOne({ id: "123456" }, { $set: { failed_attempts: 0 } });

    const s = await rpc(a, "sign_worker_link", { p_id: "123456", p_worker_id: "123456789", p_phone: "0521234567", p_full_name: "  יוסי כהן ", p_signature: SIG });
    assert.equal(s.data.ok, true);
    assert.deepEqual(s.data.codes, [
      { serial: "S1", real_code: "REAL-1", amount: 100, fuel_type: "בנזין" },
      { serial: "S2", real_code: "fallback-2", amount: 50, fuel_type: "סולר" },
    ]);
    const link = await WorkerLink.findOne({ id: "123456" }).lean();
    assert.equal(link.worker_id, "123456789");
    assert.equal(link.phone, "0521234567");
    assert.match(link.signed_at, /^\d{4}-\d{2}-\d{2}$/);
    const v = await Voucher.findOne({ serial: "S1" }).lean();
    assert.equal(v.employee_name, "יוסי כהן");
    assert.equal(v.worker_id, "123456789");
    assert.equal(v.employee_phone, "0521234567");
    const arch = await SignatureArchive.find({ link_id: "123456" }).lean();
    assert.equal(arch.length, 1);
    assert.equal(arch[0].total_amount, 250);
    assert.equal(arch[0].employee_id_number, "123456789");
    assert.equal(arch[0].branch, "חיפה");
    assert.deepEqual(arch[0].voucher_record_ids, ["S1", "S2", "S3"]);
    assert.equal(arch[0].signature_image_url, SIG);

    // Second signature is refused.
    assert.deepEqual((await rpc(a, "sign_worker_link", { p_id: "123456", p_worker_id: "987654321", p_phone: "0521111111", p_full_name: "אחר", p_signature: SIG })).data, { ok: false });

    const o = await rpc(anon(), "open_worker_wallet", { p_id: "123456", p_worker_id: "123456789", p_phone: "0521234567" });
    assert.deepEqual(o.data, { ok: true, state: "ok", attempts_left: 3, codes: s.data.codes });
    assert.equal((await rpc(anon(), "worker_link_status", { p_id: "123456" })).data.signed, true);
    assert.deepEqual((await rpc(anon(), "open_worker_wallet", { p_id: "000000", p_worker_id: "123456789", p_phone: "0521234567" })).data,
      { ok: false, state: "invalid" });
  });

  it("locks after 3 wrong id/phone attempts; staff owner or admin can unlock", async () => {
    const owner = await loginAs("supervisor", { branch: "חיפה" });
    await seedLink({ signed: true, supervisorId: owner.profile.id });
    const a = anon();
    let r = await rpc(a, "open_worker_wallet", { p_id: "123456", p_worker_id: "111111111", p_phone: "0521234567" });
    assert.deepEqual(r.data, { ok: false, state: "mismatch", attempts_left: 2 });
    r = await rpc(a, "open_worker_wallet", { p_id: "123456", p_worker_id: "123456789", p_phone: "0529999999" });
    assert.deepEqual(r.data, { ok: false, state: "mismatch", attempts_left: 1 });
    r = await rpc(a, "open_worker_wallet", { p_id: "123456", p_worker_id: "000000000", p_phone: "0500000000" });
    assert.deepEqual(r.data, { ok: false, state: "locked", attempts_left: 0 });
    const locked = await WorkerLink.findOne({ id: "123456" }).lean();
    assert.equal(locked.locked, true);
    assert.ok(locked.locked_at instanceof Date);

    // Even the correct credentials are refused now.
    r = await rpc(a, "open_worker_wallet", { p_id: "123456", p_worker_id: "123456789", p_phone: "0521234567" });
    assert.deepEqual(r.data, { ok: false, state: "locked" });
    assert.deepEqual((await rpc(a, "worker_link_status", { p_id: "123456" })).data, { exists: true, state: "locked" });

    // Anonymous / other staff cannot unlock.
    r = await rpc(anon(), "unlock_worker_link", { p_id: "123456" });
    assert.equal(r.status, 401);
    assert.equal(r.error, "נדרשת התחברות");
    const other = await loginAs("branch", { branch: "חיפה" });
    r = await rpc(other.agent, "unlock_worker_link", { p_id: "123456" });
    assert.equal(r.status, 403);
    assert.equal(r.error, "רק מי שהפיק את השובר או אדמין יכולים לשחרר את הלינק");
    r = await rpc(other.agent, "unlock_voucher_link", { p_link_id: "123456" });
    assert.equal(r.status, 403);
    assert.equal((await rpc(owner.agent, "unlock_worker_link", { p_id: "nope" })).error, "הלינק לא נמצא");

    const linkBefore = await WorkerLink.findOne({ id: "123456" }).lean();
    const cardsBefore = await Voucher.find({}, { _id: 0, serial: 1, status: 1, link_id: 1, employee_name: 1 }).sort({ serial: 1 }).lean();
    const sigsBefore = await SignatureArchive.countDocuments();

    r = await rpc(owner.agent, "unlock_worker_link", { p_id: "123456" });
    assert.equal(r.status, 200);
    assert.equal(r.data, null);

    // Unlocking a SIGNED link only resets the lock — signature, worker identity, cards and archive are untouched.
    const linkAfter = await WorkerLink.findOne({ id: "123456" }).lean();
    assert.equal(linkAfter.locked, false);
    assert.equal(linkAfter.failed_attempts, 0);
    for (const k of ["signed_at", "worker_id", "phone", "employee_name", "total", "supervisor_id"]) assert.deepEqual(linkAfter[k], linkBefore[k], k);
    assert.deepEqual(linkAfter.serials, linkBefore.serials);
    assert.deepEqual(await Voucher.find({}, { _id: 0, serial: 1, status: 1, link_id: 1, employee_name: 1 }).sort({ serial: 1 }).lean(), cardsBefore);
    assert.equal(await SignatureArchive.countDocuments(), sigsBefore);

    // …and the worker can open the wallet again with the correct details.
    r = await rpc(a, "open_worker_wallet", { p_id: "123456", p_worker_id: "123456789", p_phone: "0521234567" });
    assert.equal(r.data.ok, true);

    // unlock_voucher_link by an admin also clears per-card locks.
    await WorkerLink.updateOne({ id: "123456" }, { $set: { locked: true, failed_attempts: 3 } });
    await Voucher.updateMany({}, { $set: { is_locked: true, failed_attempts: 3 } });
    const admin = await loginAs("admin");
    r = await rpc(admin.agent, "unlock_voucher_link", { p_link_id: "123456" });
    assert.equal(r.data, true);
    assert.equal((await WorkerLink.findOne({ id: "123456" }).lean()).locked, false);
    assert.equal(await Voucher.countDocuments({ is_locked: true }), 0);
  });
});
