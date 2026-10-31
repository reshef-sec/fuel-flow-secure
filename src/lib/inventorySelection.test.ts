import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exactStockError, pickExact } from "./inventorySelection";
import { STOCK_SHORTAGE } from "./issuanceInventory";

describe("physical voucher selection", () => {
  it("cannot allocate 50 when only a 100 card exists", () => {
    assert.equal(exactStockError([{ amount: 100 }], 50), STOCK_SHORTAGE);
    assert.equal(exactStockError([], 100), STOCK_SHORTAGE);
  });
  it("selects 150 from a 100 and a 50 without reusing cards", () => {
    const cards = [{ amount: 100, id: "a" }, { amount: 50, id: "b" }];
    assert.equal(pickExact(cards, 150)?.reduce((sum, card) => sum + card.amount, 0), 150);
    assert.equal(pickExact(cards, 200), null);
  });
  it("finds an exact combination rather than greedily consuming largest first", () => {
    assert.deepEqual(pickExact([{ amount: 200 }, { amount: 150 }, { amount: 150 }], 300), [{ amount: 150 }, { amount: 150 }]);
  });
});