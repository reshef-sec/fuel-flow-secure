import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { centralPoolOf, centralFuelLimitError } from "./centralInventory";
import type { VoucherRecord } from "@/components/dashboard/voucherData";
const card = (serial: string, patch: Partial<VoucherRecord> = {}): VoucherRecord => ({
  serial, amount: 100, realCode: "", branch: "מאגר ראשי", status: "טרם שומש", updatedAt: "2026-10-19", fuelType: "בנזין", ...patch,
});
describe("central physical inventory", () => {
  it("calculates 2000 from twenty actual 100 NIS cards", () => {
    const list = Array.from({ length: 20 }, (_, i) => card(String(i)));
    assert.equal(centralPoolOf(list).reduce((sum, v) => sum + v.amount, 0), 2000);
  });
  it("excludes branch allocations, supervisor holdings, issued, blocked and redeemed cards", () => {
    const list = [card("1"), card("2", { branch: "צפון" }), card("3", { supervisor: "מפקח" }),
      card("4", { linkId: "1234" }), card("5", { status: "חסום" }), card("6", { status: "מומש סופית" })];
    assert.deepEqual(centralPoolOf(list).map(v => v.serial), ["1"]);
  });
  it("blocks per-fuel overallocation even when the combined total covers it", () => {
    const list = [card("1", { amount: 1900 }), card("2", { fuelType: "סולר" })];
    assert.ok(centralFuelLimitError({ "בנזין": 0, "סולר": 200 }, list));
    assert.equal(centralFuelLimitError({ "בנזין": 1900, "סולר": 100 }, list), null);
    assert.ok(centralFuelLimitError({ "בנזין": 2000, "סולר": 0 }, list));
  });
  it("reduces the remaining central balance when cards move to a branch", () => {
    const list = [card("1"), card("2", { branch: "צפון" })];
    assert.equal(centralPoolOf(list).reduce((sum, v) => sum + v.amount, 0), 100);
  });
});