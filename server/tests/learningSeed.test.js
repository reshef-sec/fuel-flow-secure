/**
 * סביבת לימוד — the demo dataset generator: realistic ranges, business rules, internal
 * consistency, strict isolation from the real collections, and the RPCs working on top of it.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import { LEARNING, REAL } from "../models.js";
import { runInLearning } from "../lib/learningContext.js";
import { seedLearning } from "../lib/learningSeed.js";
import { STATUS, MAIN_POOL } from "../lib/canonical.js";

before(startTestServer);
after(stopTestServer);
const wipeLearning = () => Promise.all(Object.values(LEARNING).map((m) => m.deleteMany({})));
const wipeReal = () => Promise.all(Object.values(REAL).map((m) => m.deleteMany({})));
beforeEach(async () => {
  await resetDb();
  await wipeLearning();
});

const OWNER = {
  id: "11111111-2222-4333-8444-555555555555", email: "owner@example.com", phone: "0500000001",
  full_name: "קורן מאיה", branch: "", role: "admin",
};
const inRange = (n, lo, hi, what) => assert.ok(n >= lo && n <= hi, `${what}: ${n} not in [${lo}, ${hi}]`);
const ALLOWED = { "בנזין": [50, 100, 500], "סולר": [100, 500] };

describe("learning demo seed", () => {
  it("builds a consistent dataset only in the learning collections", async () => {
    await wipeReal();
    const summary = await runInLearning(() => seedLearning({ owner: OWNER }));
    const c = summary.counts;

    // Real collections are untouched.
    for (const [name, m] of Object.entries(REAL)) assert.equal(await m.countDocuments(), 0, `REAL.${name} must stay empty`);

    inRange(c.vouchers, 650, 760, "vouchers");
    assert.equal(c.voucher_codes, c.vouchers);
    inRange(c.worker_links, 40, 50, "worker_links");
    inRange(c.b2b_clients, 28, 32, "b2b_clients");
    inRange(c.regular_clients, 28, 32, "regular_clients");
    inRange(c.activity_log, 45, 90, "activity_log");
    inRange(c.voucher_requests, 11, 13, "voucher_requests");
    assert.equal(c.branches, 4);
    assert.equal(c.app_settings, 1);
    assert.equal(c.app_users, c.profiles);

    const L = LEARNING;
    // Staff: 4 branch managers named in branches.manager, 2–3 supervisors per branch, a viewer, the owner.
    const users = await L.AppUser.find().lean();
    const branches = await L.Branch.find().lean();
    for (const b of branches) {
      const mgr = users.find((u) => u.role === "branch" && u.branch === b.name);
      assert.ok(mgr, `manager for ${b.name}`);
      assert.equal(b.manager, `${mgr.last_name} ${mgr.first_name}`);
      inRange(users.filter((u) => u.role === "supervisor" && u.branch === b.name).length, 2, 3, `supervisors ${b.name}`);
    }
    assert.equal(users.filter((u) => u.role === "viewer").length, 1);
    const ownerUser = users.find((u) => u.id === OWNER.id);
    assert.equal(ownerUser.role, "admin");
    const ownerProfile = await L.Profile.findOne({ id: OWNER.id }).lean();
    assert.equal(ownerProfile.id, OWNER.id);
    assert.equal(ownerProfile.phone, OWNER.phone);
    for (const u of users) {
      assert.ok(u.id);
      assert.match(u.phone, /^05\d{8}$/);
    }
    assert.ok(users.some((u) => u.role === "supervisor" && u.can_request));

    // Vehicle pools ~10% inactive; reasons in both categories.
    assert.ok(await L.B2BClient.countDocuments({ is_active: false }) >= 2);
    assert.ok(await L.RegularClient.countDocuments({ is_active: false }) >= 2);
    for (const v of await L.B2BClient.find().lean()) assert.match(v.standard, /^\d{8}$/);
    assert.ok(await L.IssueReason.countDocuments({ category: "B2B" }) > 0);
    assert.ok(await L.IssueReason.countDocuments({ category: "Regular" }) > 0);

    // Cards: only Paz denominations / fuels / three statuses; every card has a code.
    const vouchers = await L.Voucher.find().lean();
    const codes = new Map((await L.VoucherCode.find().lean()).map((x) => [x.serial, x]));
    const allowedStatus = new Set([STATUS.AVAILABLE, STATUS.ISSUED, STATUS.REDEEMED, STATUS.BLOCKED]);
    const profileIds = new Set((await L.Profile.find({}, { id: 1 }).lean()).map((p) => p.id));
    for (const v of vouchers) {
      assert.ok(ALLOWED[v.fuel_type]?.includes(v.amount), `${v.serial}: ${v.fuel_type} ${v.amount}`);
      assert.ok(allowedStatus.has(v.status), `${v.serial}: status ${v.status}`);
      assert.match(v.serial, /^\d{9,10}$/);
      assert.equal(v.card_number, v.serial);
      assert.ok(v.paz_match_key, "paz_match_key computed");
      const code = codes.get(v.serial);
      assert.ok(code?.real_code && code.redemption_code, `${v.serial} has a code`);
      if (v.supervisor_id) assert.ok(profileIds.has(v.supervisor_id), `${v.serial} supervisor_id is a demo profile`);
      if (v.status === STATUS.ISSUED) {
        assert.ok(v.link_id && v.employee_name && v.route && v.issued_at && v.expires_at > new Date(), `${v.serial} issued fields`);
        assert.ok(v.route === "b2b" ? v.client_code && v.standard : v.client_id && v.site_id, `${v.serial} client fields`);
      }
      if (v.status === STATUS.REDEEMED) assert.ok(v.redeemed_at <= new Date() && v.redeemed_at >= v.issued_at);
    }
    assert.ok(vouchers.some((v) => v.serial.startsWith("0")), "some card numbers have leading zeros");
    const central = vouchers.filter((v) => v.branch === MAIN_POOL && v.status === STATUS.AVAILABLE && !v.supervisor);
    assert.ok(central.length >= 150, "healthy central pool");
    assert.ok(vouchers.some((v) => v.branch !== MAIN_POOL && v.status === STATUS.AVAILABLE && !v.supervisor), "branch stock");
    assert.ok(vouchers.some((v) => v.status === STATUS.AVAILABLE && v.supervisor && v.supervisor_id), "supervisor stock");
    const redeemedMonths = new Set(vouchers.filter((v) => v.redeemed_at).map((v) => v.redeemed_at.toISOString().slice(0, 7)));
    assert.ok(redeemedMonths.size >= 4, `redemptions spread over months (${[...redeemedMonths]})`);
    const setting = await L.AppSetting.findOne({ key: "main" }).lean();
    assert.equal(setting.balance, central.reduce((t, v) => t + v.amount, 0));
    assert.equal(summary.centralBalance, setting.balance);

    // Links: serials exist, belong to the link, totals add up; signed links are archived.
    const byserial = new Map(vouchers.map((v) => [v.serial, v]));
    const links = await L.WorkerLink.find().lean();
    const archives = new Map((await L.SignatureArchive.find().lean()).map((a) => [a.link_id, a]));
    const threeMonths = Date.now() - 92 * 864e5;
    let signed = 0, waiting = 0, locked = 0;
    for (const l of links) {
      assert.match(l.id, /^\d{4,12}$/);
      assert.ok(l.serials.length >= 1 && l.serials.length <= 4);
      let total = 0;
      for (const s of l.serials) {
        const v = byserial.get(s);
        assert.ok(v, `link ${l.id} serial ${s} exists`);
        assert.ok([STATUS.ISSUED, STATUS.REDEEMED].includes(v.status));
        assert.equal(v.link_id, l.id);
        assert.equal(v.employee_name, l.employee_name);
        total += v.amount;
      }
      assert.equal(l.total, total);
      assert.ok(new Date(l.created_at).getTime() > threeMonths, "link created within ~3 months (not expired)");
      assert.equal(l.created_on, new Date(l.created_at).toISOString().slice(0, 10), "created_at keeps the issuance time");
      if (l.locked) {
        locked += 1;
        assert.equal(l.failed_attempts, 3);
        assert.ok(l.locked_at);
      } else if (l.signed_at) signed += 1;
      else waiting += 1;
      if (l.signed_at) {
        const a = archives.get(l.id);
        assert.ok(a, `archive for signed link ${l.id}`);
        assert.equal(a.employee_id_number, l.worker_id);
        assert.equal(a.employee_phone, l.phone);
        assert.deepEqual(a.voucher_record_ids, l.serials);
        assert.equal(a.total_amount, l.total);
        assert.match(a.signature_image_url, /^data:image\/svg\+xml;base64,/);
      } else {
        assert.equal(l.worker_id, null);
        assert.ok(!archives.has(l.id));
      }
    }
    assert.equal(archives.size, links.filter((l) => l.signed_at).length);
    inRange(signed, 28, 34, "signed links");
    inRange(waiting, 7, 11, "waiting links");
    inRange(locked, 3, 6, "locked links");

    // Requests: exactly four pending, valid fuel split.
    const reqs = await L.VoucherRequest.find().lean();
    const pending = reqs.filter((r) => r.status === "ממתין לאישור");
    assert.equal(pending.length, 4);
    for (const r of reqs) {
      assert.equal(r.amount, r.benzine_amount + r.diesel_amount);
      assert.equal(r.benzine_amount % 50, 0);
      assert.equal(r.diesel_amount % 100, 0);
      assert.ok(users.some((u) => u.id === r.requester_id && (u.role === "branch" || u.can_request)));
    }
    assert.ok(reqs.some((r) => r.status === "אושר" && r.approved_amount !== r.amount));
    assert.ok(reqs.some((r) => r.status === "נדחה"));

    // Activity log: realistic labels, past timestamps.
    for (const e of await L.ActivityLog.find().lean()) {
      assert.ok(["אדמין מרכזי", "מנהל סניף", "מפקח", "צופה"].includes(e.role), e.role);
      assert.ok(e.created_at <= new Date());
    }
    assert.ok(await L.ActivityLog.countDocuments({ action: "היזון חוזר מימושים מפז" }) >= 2);

    // Demo links cover the three employee-page states.
    assert.deepEqual(summary.demoLinks.map((d) => d.status).sort(), ["ממתין לחתימה", "נחתם", "נעול"].sort());
  });

  it("is deterministic across resets", async () => {
    const a = await runInLearning(() => seedLearning({ owner: OWNER }));
    const serialsA = (await LEARNING.Voucher.find({}, { serial: 1 }).sort({ serial: 1 }).lean()).map((v) => v.serial);
    await wipeLearning();
    const b = await runInLearning(() => seedLearning({ owner: OWNER }));
    const serialsB = (await LEARNING.Voucher.find({}, { serial: 1 }).sort({ serial: 1 }).lean()).map((v) => v.serial);
    assert.deepEqual(serialsA, serialsB);
    assert.deepEqual(a.demoLinks, b.demoLinks);
    assert.deepEqual(a.counts, b.counts);
  });

  it("serves the owner's learning mode and the public demo links through the RPCs", async () => {
    const o = await loginAs("admin", { fullName: "קורן מאיה" });
    process.env.DEV_TOOLS_OWNER_EMAIL = o.email;
    const realVouchers = await REAL.Voucher.countDocuments();
    const summary = await runInLearning(() => seedLearning({ owner: o.profile }));
    await REAL.Profile.updateOne({ id: o.profile.id }, { $set: { learning_mode: true } });

    const snap = await rpc(o.agent, "get_central_inventory_snapshot");
    assert.equal(snap.status, 200);
    assert.equal(snap.data.total_available_amount, summary.centralBalance);
    assert.equal(snap.data.gasoline_amount + snap.data.diesel_amount, summary.centralBalance);
    assert.ok(snap.data.denominations.length >= 5);
    for (const d of snap.data.denominations) assert.ok(ALLOWED[d.fuel_type].includes(d.amount));

    const table = await o.agent.post("/api/db/vouchers").send({ op: "select" });
    assert.equal(table.status, 200);
    assert.equal(table.body.data.length, summary.counts.vouchers, "owner reads the learning vouchers");
    assert.equal(await REAL.Voucher.countDocuments(), realVouchers);

    const signedLink = summary.demoLinks.find((d) => d.status === "נחתם");
    const waitingLink = summary.demoLinks.find((d) => d.status === "ממתין לחתימה");
    const lockedLink = summary.demoLinks.find((d) => d.status === "נעול");
    const a = anon();

    const st = await rpc(a, "worker_link_status", { p_id: signedLink.id, p_demo: true });
    assert.equal(st.data.state, "ok");
    assert.equal(st.data.signed, true);
    assert.equal(st.data.total, signedLink.total);
    const wallet = await rpc(a, "open_worker_wallet", { p_id: signedLink.id, p_worker_id: signedLink.workerId, p_phone: signedLink.phone, p_demo: true });
    assert.equal(wallet.data.ok, true);
    assert.equal(wallet.data.codes.length, signedLink.cards);
    for (const c of wallet.data.codes) assert.equal(c.real_code, null);
    const revealed = await rpc(a, "reveal_worker_code", { p_id: signedLink.id, p_worker_id: signedLink.workerId, p_phone: signedLink.phone, p_serial: wallet.data.codes[0].serial, p_demo: true });
    assert.match(revealed.data.code.real_code, /^\d{12}$/);
    // The same link is unknown to the real data.
    assert.equal((await rpc(a, "worker_link_status", { p_id: signedLink.id })).data.exists, false);

    const w = await rpc(a, "worker_link_status", { p_id: waitingLink.id, p_demo: true });
    assert.equal(w.data.state, "ok");
    assert.equal(w.data.signed, false);
    assert.equal(w.data.employee_name, waitingLink.employeeName);
    assert.equal((await rpc(a, "worker_link_status", { p_id: lockedLink.id, p_demo: true })).data.state, "locked");
  });
});
