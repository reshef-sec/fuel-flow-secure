import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { historicalClientName, isActiveClient, normalizeVoucherStatus, partitionStockRows } from "./importIntegrity";
import { isAvailable } from "../components/dashboard/voucherData";
describe("import integrity", () => {
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
  it("displays redeemed as actual redemption and excludes it from inventory", () => {
    assert.equal(normalizeVoucherStatus("redeemed"), "מומש בפועל");
    assert.equal(isAvailable({ serial:"1", realCode:"", amount:100,branch:"מאגר ראשי",status:"מומש בפועל",updatedAt:"2026-10-31" }), false);
  });
});