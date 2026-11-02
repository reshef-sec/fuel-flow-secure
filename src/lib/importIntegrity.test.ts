import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { historicalClientName, isActiveClient, normalizeVoucherStatus, partitionStockRows, pazCardMatchKey, pazFeedbackCardNumbers } from "./importIntegrity";
import { isAvailable } from "../components/dashboard/voucherData";
describe("import integrity", () => {
  it("maps issued database rows to employee-issued status", () => {
    assert.equal(normalizeVoucherStatus("issued"), "הוקצה לעובד");
  });
  it("offers only explicitly active clients for new issuance", () => {
    assert.equal(isActiveClient({ isActive: true }), true);
    assert.equal(isActiveClient({ isActive: false }), false);
    assert.equal(isActiveClient({}), false);
  });
  it("resolves inactive historical clients without replacing voucher snapshots", () => {
    const regular = [{ clientId:"C1",siteId:"S1",clientName:"Historical",isActive:false }];
    const b2b = [{ clientCode:"B1",accountName:"A1",clientName:"Past B2B",isActive:false }];
    assert.equal(historicalClientName({ clientId:"C1",siteId:"S1" },regular,b2b),"Historical");
    assert.equal(historicalClientName({ route:"b2b",clientCode:"B1",accountName:"A1" },regular,b2b),"Past B2B");
    assert.equal(historicalClientName({ client:"Original snapshot",clientId:"C1",siteId:"S1" },regular,b2b),"Original snapshot");
  });
  it("skips historical cards and repeated file rows while preserving new numbers", () => {
    const result = partitionStockRows([["0001"],["0002"],["0002"],["0003"]], new Set(["0001"]));
    assert.deepEqual(result.accepted, [["0002"],["0003"]]);
    assert.equal(result.skipped, 2);
  });
  it("maps redeemed and legacy actual redemption to final redemption, excluded from inventory", () => {
    assert.equal(normalizeVoucherStatus("redeemed"), "מומש סופית");
    assert.equal(normalizeVoucherStatus("מומש בפועל"), "מומש סופית");
    assert.equal(isAvailable({ serial:"1", realCode:"", amount:100,branch:"מאגר ראשי",status:"מומש סופית",updatedAt:"2026-10-31" }), false);
  });
  it("matches Column A numeric 19950 to stored 019950 without changing stored IDs", () => {
    assert.equal(pazCardMatchKey(" 019950 "), "19950");
    assert.equal(pazCardMatchKey(19950), "19950");
    assert.equal(pazCardMatchKey("\uFEFF01\u00a09950\t"), "19950");
    assert.equal(pazCardMatchKey("19950.0"), "19950");
    assert.equal(pazCardMatchKey("00012345678901234567890"), "12345678901234567890");
    assert.equal(pazCardMatchKey("AB019950"), "AB019950");
  });
  it("deduplicates normalized Column A only and ignores blank cells", () => {
    assert.deepEqual(pazFeedbackCardNumbers([["019950", "unrelated"], [19950], ["19950.00"], [""], [null], ["019951"]]), ["19950", "19951"]);
  });
});