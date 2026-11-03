import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { poolDenominations } from "./poolDenominations";

describe("central pool denominations", () => {
  it("limits diesel face values to 50, 100 and 500 without changing stock", () => {
    const rows = [500, 150, 100, 200, 50].map(amount => ({ amount, count: 1, fuel_type: "סולר" as const }));
    const result = poolDenominations(rows, "סולר");
    assert.deepEqual(result.visible.map(row => row.amount), [50, 100, 500]);
    assert.equal(result.unexpectedTotal, 350);
    assert.equal(rows.length, 5);
  });
  it("keeps all distinct petrol values in ascending order", () => {
    const rows = [300, 150, 200, 100].map(amount => ({ amount, count: 1, fuel_type: "בנזין" as const }));
    assert.deepEqual(poolDenominations(rows, "בנזין").visible.map(row => row.amount), [100, 150, 200, 300]);
  });
});