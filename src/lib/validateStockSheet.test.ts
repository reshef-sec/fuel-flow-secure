import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateStockSheet } from "./validateStockSheet";
const H = ["מספר כרטיס", "קוד", "ערך", "סוג", "תוקף"];
describe("validateStockSheet", () => {
  it("accepts a valid file", () => {
    assert.equal((validateStockSheet([H, ["019949", "X1", "100", "סולר", "2027-12-31"]]) as string[][]).length, 1);
  });
  it("rejects wrong headers", () => {
    assert.equal(typeof validateStockSheet([["a", "b", "c", "d", "e"], ["1", "x", "100", "סולר", ""]]), "string");
  });
  it("rejects amounts not in multiples of 50", () => {
    assert.equal(typeof validateStockSheet([H, ["1", "x", "120", "בנזין 95", ""]]), "string");
  });
  it("rejects unknown fuel type", () => {
    assert.equal(typeof validateStockSheet([H, ["1", "x", "100", "גז", ""]]), "string");
  });
});
