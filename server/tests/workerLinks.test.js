/** The employee link: SMS code, device session, finger signature, wallet with revealed codes. */
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import { LEARNING, REAL, SignatureArchive, Voucher, VoucherCode, WorkerLink } from "../models.js";
import { transport } from "../lib/sms.js";

const ID = "abcDEF123456";
const SIG = "data:image/png;base64,AAAA";
let sent;
const realSend = transport.send;

before(async () => {
  await startTestServer();
  transport.send = async (to, text) => { sent.push({ to, text }); };
});
after(async () => { transport.send = realSend; await stopTestServer(); });
beforeEach(async () => {
  sent = [];
  await resetDb();
  await LEARNING.WorkerLink.deleteMany({});
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "b", TWILIO_FROM: "c" });
});
afterEach(() => { for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]) delete process.env[k]; });

/** Issues a real link through the API; returns the code that went out by SMS. */
async function issue(agent, id = ID, phone = "0521234567") {
  if (!(await REAL.RegularClient.exists({ client_id: "77" }))) await RegularClientSeed();
  await Voucher.create([
    { serial: "S1", amount: 100, fuel_type: "בנזין", branch: "מאגר ראשי", status: "טרם שומש" },
    { serial: "S2", amount: 100, fuel_type: "סולר", branch: "מאגר ראשי", status: "טרם שומש" },
  ]);
  await VoucherCode.create([{ serial: "S1", real_code: "REAL-1" }, { serial: "S2", real_code: "REAL-2" }]);
  const details = { route: "regular", client_id: "77", site_id: "1" };
  const r = await rpc(agent, "issue_voucher_to_worker", {
    p_items: [{ amount: 100, fuel_type: "בנזין", details }, { amount: 100, fuel_type: "סולר", details }],
    p_branch: "מאגר ראשי", p_supervisor: null, p_link: { id, employee_name: "יוסי כהן", phone },
  });
  assert.equal(r.status, 200, r.error);
  return { result: r.data, code: /קוד אימות: (\d{4})/.exec(sent.at(-1)?.text ?? "")?.[1] };
}
const RegularClientSeed = () => REAL.RegularClient.create({ client_id: "77", site_id: "1", client_name: "לקוח", site_name: "אתר", is_active: true });
const verify = (code, id = ID) => rpc(anon(), "verify_worker_otp", { p_id: id, p_code: code });
const wrongCode = (code) => (code === "0000" ? "1111" : "0000");

describe("issuing a voucher", () => {
  it("sends one SMS with the link and a 4-digit code, and stores only a hash", async () => {
    const { agent } = await loginAs("admin");
    const { result, code } = await issue(agent);
    assert.equal(result.sms_sent, true);
    assert.equal(result.otp, undefined);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "+972521234567");
    assert.match(sent[0].text, /\/v\/abcDEF123456/);
    assert.match(code, /^\d{4}$/);
    const link = await REAL.WorkerLink.findOne({ id: ID }).lean();
    assert.equal(link.phone, "0521234567");
    assert.notEqual(link.otp_hash, code);
  });

  it("needs a phone, and hands the code to the issuer when SMS can't deliver", async () => {
    const { agent } = await loginAs("admin");
    const bad = await rpc(agent, "issue_voucher_to_worker", { p_items: [{ amount: 100, fuel_type: "בנזין", details: {} }], p_branch: "מאגר ראשי", p_link: { id: ID, employee_name: "יוסי" } });
    assert.equal(bad.error, "מספר נייד לא תקין");

    delete process.env.TWILIO_ACCOUNT_SID;
    const { result } = await issue(agent, "noSmsLink1");
    assert.equal(result.sms_sent, false);
    assert.match(result.otp, /^\d{4}$/);
    assert.equal(sent.length, 0);
    assert.equal((await verify(result.otp, "noSmsLink1")).data.ok, true);
  });

  it("never sends a real SMS from the learning environment", async () => {
    const o = await loginAs("admin");
    process.env.DEV_TOOLS_OWNER_EMAIL = o.email;
    await REAL.Profile.updateOne({ id: o.profile.id }, { $set: { learning_mode: true } });
    await LEARNING.RegularClient.create({ client_id: "77", site_id: "1", client_name: "ל", site_name: "א", is_active: true });
    await LEARNING.Voucher.create({ serial: "D1", amount: 100, fuel_type: "בנזין", branch: "מאגר ראשי", status: "טרם שומש" });
    const r = await rpc(o.agent, "issue_voucher_to_worker", {
      p_items: [{ amount: 100, fuel_type: "בנזין", details: { route: "regular", client_id: "77", site_id: "1" } }],
      p_branch: "מאגר ראשי", p_supervisor: null, p_link: { id: "demoLink01", employee_name: "דמו", phone: "0521234567" },
    });
    assert.equal(r.status, 200, r.error);
    assert.equal(sent.length, 0);
    assert.match(r.data.otp, /^\d{4}$/);
    await LEARNING.Voucher.deleteMany({});
    await LEARNING.RegularClient.deleteMany({});
    delete process.env.DEV_TOOLS_OWNER_EMAIL;
  });
});

describe("opening the link", () => {
  it("shows only status, total and name before the code", async () => {
    const { agent } = await loginAs("admin");
    await issue(agent);
    const s = (await rpc(anon(), "worker_link_status", { p_id: ID })).data;
    assert.deepEqual(s, { exists: true, state: "ok", total: 200, signed: false, employee_name: "יוסי כהן", reachable: true });
    assert.equal((await rpc(anon(), "open_worker_wallet", { p_id: ID, p_session: "forged" })).data.ok, false);
    assert.equal((await rpc(anon(), "sign_worker_link", { p_id: ID, p_session: "forged", p_signature: SIG })).data.ok, false);
  });

  it("the code works once, and 5 wrong tries end it until a new one is sent", async () => {
    const { agent } = await loginAs("admin");
    const { code } = await issue(agent);
    assert.equal((await verify(wrongCode(code))).data.attempts_left, 4);
    assert.equal((await verify(code)).data.ok, true, "a wrong try does not burn the code");
    assert.equal((await verify(code)).data.state, "new_code_needed", "one use only");

    await WorkerLink.updateOne({ id: ID }, { $set: { otp_sent_at: new Date(0) } });
    assert.equal((await rpc(anon(), "request_worker_otp", { p_id: ID })).data.ok, true);
    const fresh = /קוד אימות: (\d{4})/.exec(sent.at(-1).text)[1];
    assert.equal(sent.length, 2);
    assert.equal(sent.at(-1).to, "+972521234567", "only to the phone on the link");
    assert.equal((await rpc(anon(), "request_worker_otp", { p_id: ID })).data.state, "wait", "one request a minute");
    for (let i = 0; i < 5; i += 1) await verify(wrongCode(fresh));
    assert.equal((await verify(fresh)).data.state, "new_code_needed");
  });

  it("signs with a finger, archives without any ID, and a second signature is refused", async () => {
    const { agent } = await loginAs("admin");
    const { code } = await issue(agent);
    const { session } = (await verify(code)).data;
    const s = await rpc(anon(), "sign_worker_link", { p_id: ID, p_session: session, p_signature: SIG });
    assert.equal(s.data.ok, true);
    assert.deepEqual(s.data.codes.map((c) => [c.serial, c.real_code, c.revealed]), [["S1", null, false], ["S2", null, false]]);

    const link = await REAL.WorkerLink.findOne({ id: ID }).lean();
    assert.match(link.signed_at, /^\d{4}-\d{2}-\d{2}$/);
    const v = await Voucher.findOne({ serial: "S1" }).lean();
    assert.equal(v.employee_phone, "0521234567");
    const [arch] = await SignatureArchive.find({ link_id: ID }).lean();
    assert.equal(arch.employee_name, "יוסי כהן");
    assert.equal(arch.employee_phone, "0521234567");
    assert.equal(arch.total_amount, 200);
    assert.equal(arch.employee_id_number, undefined);
    assert.equal((await rpc(anon(), "sign_worker_link", { p_id: ID, p_session: session, p_signature: SIG })).data.ok, false);
    assert.equal((await rpc(anon(), "worker_link_status", { p_id: ID })).data.signed, true);
  });

  it("a revealed code stays revealed; the rest stay off the phone; a session fits one link", async () => {
    const { agent } = await loginAs("admin");
    const { code } = await issue(agent);
    const { session } = (await verify(code)).data;
    await rpc(anon(), "sign_worker_link", { p_id: ID, p_session: session, p_signature: SIG });
    const who = { p_id: ID, p_session: session };
    const rev = await rpc(anon(), "reveal_worker_code", { ...who, p_serial: "S1" });
    assert.deepEqual(rev.data.code, { serial: "S1", real_code: "REAL-1", amount: 100, fuel_type: "בנזין", revealed: true });
    const again = await rpc(anon(), "open_worker_wallet", who);
    assert.deepEqual(again.data.codes.map((c) => c.real_code), ["REAL-1", null]);
    assert.equal((await rpc(anon(), "reveal_worker_code", { ...who, p_serial: "NOT-MINE" })).data.ok, false);
    assert.equal((await rpc(anon(), "open_worker_wallet", { p_id: "anotherLink1", p_session: session })).data.ok, false);
    assert.equal((await rpc(anon(), "reveal_worker_code", { p_id: ID, p_session: "x", p_serial: "S2" })).data.ok, false);
  });

  it("the codes in SMS and hash never reach staff reads", async () => {
    const { agent } = await loginAs("admin");
    await issue(agent);
    const rows = (await agent.post("/api/db/worker_links").send({ op: "select" })).body.data;
    assert.equal("otp_hash" in rows[0], false);
  });
});

describe("resending", () => {
  it("the issuer or an admin can send a new code, also to a corrected phone", async () => {
    const admin = await loginAs("admin");
    await issue(admin.agent);
    const other = await loginAs("supervisor", { branch: "חיפה" });
    assert.equal((await rpc(other.agent, "resend_worker_sms", { p_id: ID })).status, 403);
    const r = await rpc(admin.agent, "resend_worker_sms", { p_id: ID, p_phone: "0541111111" });
    assert.equal(r.status, 200, r.error);
    assert.equal(r.data.sms_sent, true);
    assert.equal(sent.at(-1).to, "+972541111111");
    assert.equal((await REAL.WorkerLink.findOne({ id: ID }).lean()).phone, "0541111111");
    assert.equal((await rpc(admin.agent, "resend_worker_sms", { p_id: ID, p_phone: "123" })).status, 400);
  });
});
