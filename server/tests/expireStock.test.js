/** Cards not issued to a worker within 3 months of entering stock become חסום. */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc } from "./helpers.js";
import { LEARNING, REAL, Voucher } from "../models.js";
import { addMonths } from "../lib/issuanceGuard.js";
import { blockExpiredStock } from "../lib/expireStock.js";
import { runInLearning } from "../lib/learningContext.js";
import { MAIN_POOL, STATUS } from "../lib/canonical.js";

before(startTestServer);
after(stopTestServer);
beforeEach(async () => { await resetDb(); await LEARNING.Voucher.deleteMany({}); });

const old = () => addMonths(new Date(), -4);
const card = (serial, created_at, extra = {}) => ({ serial, amount: 100, fuel_type: "בנזין", branch: MAIN_POOL, status: STATUS.AVAILABLE, created_at, ...extra });
const statusOf = async (serial) => (await REAL.Voucher.findOne({ serial }).lean()).status;

describe("3-month stock expiry", () => {
  it("blocks only unissued cards older than 3 months, wherever they sit", async () => {
    await Voucher.create([
      card("OLD-CENTRAL", old()),
      card("OLD-BRANCH", old(), { branch: "חיפה" }),
      card("OLD-SUPERVISOR", old(), { branch: "חיפה", supervisor: "כהן דני" }),
      card("NEW", new Date()),
      card("OLD-ISSUED", old(), { status: STATUS.ISSUED, link_id: "123456", worker_name: "עובד" }),
      card("OLD-REDEEMED", old(), { status: STATUS.REDEEMED }),
    ]);
    assert.equal(await blockExpiredStock(), 3);
    for (const s of ["OLD-CENTRAL", "OLD-BRANCH", "OLD-SUPERVISOR"]) assert.equal(await statusOf(s), STATUS.BLOCKED, s);
    assert.equal(await statusOf("NEW"), STATUS.AVAILABLE);
    assert.equal(await statusOf("OLD-ISSUED"), STATUS.ISSUED);
    assert.equal(await statusOf("OLD-REDEEMED"), STATUS.REDEEMED);
    assert.ok((await REAL.Voucher.findOne({ serial: "OLD-CENTRAL" }).lean()).blocked_at);
    assert.equal(await blockExpiredStock(), 0, "repeating changes nothing");
  });

  it("an expired card leaves the balance and can't be allocated, even before the hourly sweep", async () => {
    const { agent } = await loginAs("admin");
    await Voucher.create(card("X1", old()));
    const r = await rpc(agent, "transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "בנזין", serials: ["X1"] }], p_branch: "חיפה" });
    assert.equal(r.status, 400);
    assert.equal(await statusOf("X1"), STATUS.BLOCKED);
    assert.equal((await rpc(agent, "get_central_inventory_snapshot")).data.total_available_amount, 0);
  });

  it("the learning sweep touches demo cards only", async () => {
    await REAL.Voucher.create(card("REAL-OLD", old()));
    await LEARNING.Voucher.create(card("DEMO-OLD", old()));
    await runInLearning(() => blockExpiredStock());
    assert.equal(await statusOf("REAL-OLD"), STATUS.AVAILABLE);
    assert.equal((await LEARNING.Voucher.findOne({ serial: "DEMO-OLD" }).lean()).status, STATUS.BLOCKED);
  });
});
