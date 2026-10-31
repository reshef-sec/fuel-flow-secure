import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isActiveClient, normalizeVoucherStatus, partitionStockRows } from "./importIntegrity";
import { isAvailable } from "../components/dashboard/voucherData";
describe("import integrity", () => {
  it("offers only explicitly active clients for new issuance", () => {
    assert.equal(isActiveClient({ isActive: true }), true);
    assert.equal(isActiveClient({ isActive: false }), false);
    assert.equal(isActiveClient({}), false);
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