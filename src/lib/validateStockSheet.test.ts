import { describe, expect, it } from "vitest";
import { validateStockSheet } from "./validateStockSheet";
const H = ["מספר כרטיס", "קוד", "ערך", "סוג", "תוקף"];
describe("validateStockSheet", () => {
  it("accepts a valid file", () => {
    expect(validateStockSheet([H, ["019949", "X1", "100", "סולר", "2027-12-31"]])).toHaveLength(1);
  });
  it("rejects wrong headers", () => {
    expect(typeof validateStockSheet([["a", "b", "c", "d", "e"], ["1", "x", "100", "סולר", ""]])).toBe("string");
  });
  it("rejects amounts not in multiples of 50", () => {
    expect(typeof validateStockSheet([H, ["1", "x", "120", "בנזין 95", ""]])).toBe("string");
  });
  it("rejects unknown fuel type", () => {
    expect(typeof validateStockSheet([H, ["1", "x", "100", "גז", ""]])).toBe("string");
  });
});
