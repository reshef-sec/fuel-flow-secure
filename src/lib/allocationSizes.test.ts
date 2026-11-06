import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alternativeApproval, countsFromSizes, emptySizeCounts, fitsStock, fuelSizesAmount, pickBySize, readSizeCounts, sizesFor, sizesText, stockFromSummary } from "./allocationSizes";

const card = (serial: string, amount: number) => ({ serial, amount });
const pools = {
  "בנזין": [card("p1", 50), card("p2", 50), card("p3", 100), card("p4", 500)],
  "סולר": [card("d1", 100), card("d2", 500), card("d3", 500)],
};
const stock = stockFromSummary([
  { amount: 50, fuel_type: "בנזין", count: 2 }, { amount: 100, fuel_type: "בנזין", count: 1 }, { amount: 500, fuel_type: "בנזין", count: 1 },
  { amount: 100, fuel_type: "סולר", count: 1 }, { amount: 500, fuel_type: "סולר", count: 2 },
]);

describe("allocation by voucher size", () => {
  it("offers petrol 50/100/500 and diesel 100/500, plus any other value really in stock", () => {
    assert.deepEqual(sizesFor("בנזין", stockFromSummary([])), [50, 100, 500]);
    assert.deepEqual(sizesFor("סולר", stockFromSummary([])), [100, 500]);
    assert.deepEqual(sizesFor("סולר", stockFromSummary([{ amount: 50, fuel_type: "סולר", count: 3 }])), [50, 100, 500]);
  });
  it("mixes sizes and fuels in one allocation and sends exactly those cards", () => {
    const c = emptySizeCounts();
    c["בנזין"][50] = "2"; c["בנזין"][500] = "1"; c["סולר"][500] = "2";
    const r = readSizeCounts(c, stock);
    assert.notEqual(typeof r, "string");
    if (typeof r === "string") return;
    assert.deepEqual(r.split, { "בנזין": 600, "סולר": 1000 });
    assert.deepEqual(pickBySize(pools["בנזין"], r.sizes["בנזין"])?.map((v) => v.serial).sort(), ["p1", "p2", "p4"]);
    assert.deepEqual(pickBySize(pools["סולר"], r.sizes["סולר"])?.map((v) => v.serial).sort(), ["d2", "d3"]);
  });
  it("refuses more cards of a size than exist, without substituting another size", () => {
    const c = emptySizeCounts();
    c["בנזין"][100] = "2"; // only one 100 card, even though two 50s + 500 could cover the value
    assert.match(String(readSizeCounts(c, stock)), /100 ₪/);
    assert.equal(pickBySize(pools["בנזין"], { 100: 2 }), null);
  });
  it("rejects an empty form and invalid counts", () => {
    assert.equal(typeof readSizeCounts(emptySizeCounts(), stock), "string");
    const c = emptySizeCounts();
    c["סולר"][100] = "1.5";
    assert.equal(typeof readSizeCounts(c, stock), "string");
  });
});

describe("requests by voucher size", () => {
  it("a request is not limited by stock, and saved sizes return to the form", () => {
    const c = emptySizeCounts();
    c["בנזין"][500] = "40"; c["סולר"][100] = "3";
    const r = readSizeCounts(c, null);
    assert.notEqual(typeof r, "string");
    if (typeof r === "string") return;
    assert.deepEqual(r.split, { "בנזין": 20000, "סולר": 300 });
    assert.deepEqual(countsFromSizes(r.sizes), c);
    assert.equal(sizesText({ 50: 2, 500: 3 }), "3×500 + 2×50");
  });
});

describe("alternative cards when stock is short", () => {
  const ask = (benzine: Record<number, number>, diesel: Record<number, number> = {}) => ({
    sizes: { "בנזין": benzine, "סולר": diesel },
    amount: 0,
  });

  it("keeps the requested cards that exist and tops up to the same amount", () => {
    const stock = { "בנזין": { 500: 1, 100: 10, 50: 4 }, "סולר": {} };
    const r = alternativeApproval(ask({ 500: 2 }), stock);
    assert.deepEqual(r["בנזין"], { 500: 1, 100: 5 });
    assert.equal(fuelSizesAmount(r), 1000);
    assert.ok(fitsStock(r, stock));
    assert.ok(!fitsStock(ask({ 500: 2 }).sizes, stock));
  });

  it("finds the exact amount even when keeping a requested card would block it", () => {
    const r = alternativeApproval(ask({ 50: 3 }), { "בנזין": { 50: 2, 100: 1 }, "סולר": {} });
    assert.equal(fuelSizesAmount(r), 150);
  });

  it("offers as much as exists when the amount cannot be reached", () => {
    const r = alternativeApproval(ask({ 500: 2 }, { 100: 3 }), { "בנזין": { 100: 4 }, "סולר": {} });
    assert.deepEqual(r, { "בנזין": { 100: 4 }, "סולר": {} });
  });

  it("never swaps one fuel for the other", () => {
    const r = alternativeApproval(ask({}, { 500: 1 }), { "בנזין": { 500: 9 }, "סולר": {} });
    assert.equal(fuelSizesAmount(r), 0);
  });

  it("older requests use their fuel amounts, or petrol when there is no split", () => {
    const stock = { "בנזין": { 100: 5 }, "סולר": { 100: 5 } };
    assert.deepEqual(alternativeApproval({ benzineAmount: 100, dieselAmount: 200, amount: 300 }, stock), { "בנזין": { 100: 1 }, "סולר": { 100: 2 } });
    assert.deepEqual(alternativeApproval({ amount: 300 }, stock), { "בנזין": { 100: 3 }, "סולר": {} });
  });
});
