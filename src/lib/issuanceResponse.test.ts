import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseIssuanceResponse } from "./issuanceResponse";

describe("JSONB issuance response", () => {
  test("uses the persisted link ID and handles SQL numeric values without rigid row types", () => {
    const result = parseIssuanceResponse({ link_id: "987654321", total: "150", vouchers: [
      { serial: "0001", amount: "100", fuel_type: "בנזין 95", item_index: 0, link_id: "987654321" },
      { serial: "0002", amount: 50, fuel_type: "סולר", item_index: 1, link_id: "987654321" },
    ] }, "123456789", 2);
    assert.equal(result.linkId, "987654321");
    assert.equal(result.total, 150);
    assert.deepEqual(result.cards, [
      { serial: "0001", amount: 100, fuelType: "בנזין", itemIndex: 0 },
      { serial: "0002", amount: 50, fuelType: "סולר", itemIndex: 1 },
    ]);
  });
  test("supports previous table responses while SQL is being installed", () => {
    assert.equal(parseIssuanceResponse([{ serial: "1", amount: 50, fuel_type: "סולר", item_index: 0 }], "123456", 1).linkId, "123456");
  });
  test("rejects empty results instead of publishing an unsaved link", () => {
    for (const value of [null, [], {}, { link_id: "123456", vouchers: [], total: 0 }]) {
      assert.throws(() => parseIssuanceResponse(value, "123456", 1));
    }
  });
  test("rejects malformed or inconsistent card results", () => {
    const card = { serial: "1", amount: 100, item_index: 0, fuel_type: "בנזין" };
    for (const rows of [[{ ...card, item_index: 2 }], [card, card], [{ ...card, amount: "NaN" }], [{ ...card, link_id: "654321" }]]) {
      assert.throws(() => parseIssuanceResponse({ link_id: "123456", total: 100, vouchers: rows }, "123456", 1));
    }
    assert.throws(() => parseIssuanceResponse({ link_id: "123456", total: 50, vouchers: [card] }, "123456", 1));
  });
});