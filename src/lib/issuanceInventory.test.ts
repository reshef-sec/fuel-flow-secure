import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { issuanceAmountError, issuanceAmountRules, fuelStockError, DIESEL_SHORTAGE, validateFuelSplit } from "./issuanceInventory";
describe("employee issuance rules", () => {
  it("petrol accepts 50 steps with a minimum of 50", () => {
    for (const n of [50, 100, 150, 300]) assert.equal(issuanceAmountError("בנזין", n), null);
    for (const n of [0, 25, 75, 120]) assert.ok(issuanceAmountError("בנזין", n));
    assert.equal(issuanceAmountRules("בנזין").min, 50);
    assert.equal(issuanceAmountRules("בנזין").step, 50);
  });
  it("diesel accepts only 100 steps with a minimum of 100", () => {
    for (const n of [100, 200, 600]) assert.equal(issuanceAmountError("סולר", n), null);
    for (const n of [0, 25, 50, 150, -100, NaN]) assert.ok(issuanceAmountError("סולר", n));
    assert.equal(issuanceAmountRules("סולר").min, 100);
    assert.equal(issuanceAmountRules("סולר").step, 100);
  });
  it("blocks diesel with zero physical cards", () => {
    assert.equal(fuelStockError("סולר", 100, []), DIESEL_SHORTAGE);
  });
  it("blocks diesel when physical value is insufficient", () => {
    assert.equal(fuelStockError("סולר", 200, [{ amount: 100 }]), DIESEL_SHORTAGE);
    assert.equal(fuelStockError("סולר", 100, [{ amount: 100 }]), null);
  });
  it("enforces petrol 50 and diesel 100 in allocation splits", () => {
    assert.deepEqual(validateFuelSplit({ "בנזין": "150", "סולר": "100" }), { "בנזין": 150, "סולר": 100 });
    assert.equal(typeof validateFuelSplit({ "בנזין": "100", "סולר": "50" }), "string");
    assert.equal(typeof validateFuelSplit({ "בנזין": "", "סולר": "25" }), "string");
    assert.deepEqual(validateFuelSplit({ "בנזין": "50", "סולר": "" }), { "בנזין": 50, "סולר": 0 });
  });
});