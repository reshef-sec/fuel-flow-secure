import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cardsOfSize, emptySizeCounts, pickBySize, readSizeCounts } from "./allocationSizes";

const card = (serial: string, amount: number) => ({ serial, amount });
const pools = {
  "בנזין": [card("p1", 50), card("p2", 50), card("p3", 100), card("p4", 500)],
  "סולר": [card("d1", 100), card("d2", 500), card("d3", 500)],
};

describe("allocation by voucher size", () => {
  it("offers petrol 50/100/500 and diesel 100/500 only", () => {
    const c = emptySizeCounts();
    assert.deepEqual(Object.keys(c["בנזין"]).map(Number), [50, 100, 500]);
    assert.deepEqual(Object.keys(c["סולר"]).map(Number), [100, 500]);
  });
  it("mixes sizes and fuels in one allocation and sends exactly those cards", () => {
    const c = emptySizeCounts();
    c["בנזין"][50] = "2"; c["בנזין"][500] = "1"; c["סולר"][500] = "2";
    const r = readSizeCounts(c, pools);
    assert.notEqual(typeof r, "string");
    if (typeof r === "string") return;
    assert.deepEqual(r.split, { "בנזין": 600, "סולר": 1000 });
    assert.deepEqual(pickBySize(pools["בנזין"], r.sizes["בנזין"])?.map((v) => v.serial).sort(), ["p1", "p2", "p4"]);
    assert.deepEqual(pickBySize(pools["סולר"], r.sizes["סולר"])?.map((v) => v.serial).sort(), ["d2", "d3"]);
  });
  it("refuses more cards of a size than exist, without substituting another size", () => {
    const c = emptySizeCounts();
    c["בנזין"][100] = "2"; // only one 100 card, even though two 50s + 500 could cover the value
    assert.match(String(readSizeCounts(c, pools)), /100 ₪/);
    assert.equal(pickBySize(pools["בנזין"], { 100: 2 }), null);
  });
  it("rejects an empty form and invalid counts", () => {
    assert.equal(typeof readSizeCounts(emptySizeCounts(), pools), "string");
    const c = emptySizeCounts();
    c["סולר"][100] = "1.5";
    assert.equal(typeof readSizeCounts(c, pools), "string");
  });
  it("counts cards of a size", () => assert.equal(cardsOfSize(pools["בנזין"], 50), 2));
});
