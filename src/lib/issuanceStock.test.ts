import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { canonicalFuel, cardsOfFuel, issuancePool } from "./issuanceStock";
import { pickExact } from "./inventorySelection";

const card = (serial: string, p: Record<string, unknown>) => ({ serial, amount: 100, branch: "צפון", status: "טרם שומש", ...p });

describe("issuance stock matching", () => {
  test("'בנזין 95' and 'בנזין' are the same fuel; דיזל is סולר", () => {
    assert.equal(canonicalFuel("בנזין 95"), "בנזין");
    assert.equal(canonicalFuel("דיזל"), "סולר");
  });
  test("branch manager matches 'סניף צפון' stock for branch 'צפון'", () => {
    const pool = issuancePool([card("1", { branch: "סניף צפון" }), card("2", { branch: "דרום" })], { role: "branch", branch: "צפון" });
    assert.deepEqual(pool.map(v => v.serial), ["1"]);
  });
  test("supervisor sees cards held by name in branch suffix", () => {
    const pool = issuancePool([card("1", { branch: "צפון (מפקח דן כהן)" }), card("2", {})], { role: "supervisor", branch: "צפון", supervisorName: "דן כהן" });
    assert.deepEqual(pool.map(v => v.serial), ["1"]);
  });
  test("admin issues from central pool under either name, status 'available' accepted", () => {
    const pool = issuancePool([card("1", { branch: "מאגר ראשי" }), card("2", { branch: "מאגר מרכזי", status: "available" }), card("3", {})], { role: "admin" });
    assert.deepEqual(pool.map(v => v.serial), ["1", "2"]);
  });
  test("₪50 diesel request finds one stored 'סולר' ₪50 card with string amount", () => {
    const pool = issuancePool([card("9", { amount: "50", fuelType: "סולר" })], { role: "branch", branch: "צפון" });
    assert.equal(pickExact(cardsOfFuel(pool, "סולר"), 50)?.length, 1);
  });
  test("already issued cards are excluded", () => {
    assert.equal(issuancePool([card("1", { linkId: "123" })], { role: "branch", branch: "צפון" }).length, 0);
  });
});
