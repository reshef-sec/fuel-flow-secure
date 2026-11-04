import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { branchBalanceRows, branchStockTotal } from "./stockBalances.ts";

const card = (serial: string, branch: string, amount: number, extra: Record<string, unknown> = {}) =>
  ({ serial, branch, amount, status: "טרם שומש", fuelType: "בנזין", ...extra });

const users = [
  { id: "m1", lastName: "לוי", firstName: "מיכל", role: "branch", branch: "חיפה" },
  { id: "s1", lastName: "כהן", firstName: "דני", role: "supervisor", branch: "חיפה", canRequest: true },
  { id: "s2", lastName: "פרץ", firstName: "יוסי", role: "supervisor", branch: "חיפה" }, // no request rights
  { id: "s3", lastName: "חדד", firstName: "אלון", role: "supervisor", branch: "חיפה" }, // no stock
];
const branches = [{ id: "b1", name: "חיפה" }, { id: "b2", name: "תל אביב", manager: "גבאי רון" }];

describe("branch stock balances", () => {
  it("the allocations rows add up exactly to the dashboard's branch budget", () => {
    const stock = [
      card("1", "מאגר ראשי", 500), card("2", "", 100), card("3", "מאגר מרכזי", 100), // central — excluded
      card("4", "חיפה", 1000), card("5", "סניף חיפה", 500, { fuelType: "סולר" }),        // branch (manager)
      card("6", "חיפה", 300, { supervisor: "כהן דני" }),                                 // request-authorised supervisor
      card("7", "חיפה", 200, { supervisor: "פרץ יוסי" }),                                // plain supervisor — was missing before
      card("8", "חיפה (מפקח פרץ יוסי)", 100),                                            // legacy embedded holder
      card("9", "תל אביב", 400),                                                          // branch without a manager user
      card("10", "חיפה", 50, { supervisor: "מפקח שעזב" }),                               // holder with no user — never hidden
      card("11", "חיפה", 100, { linkId: "123" }), card("12", "חיפה", 100, { status: "מומש סופית" }), // not available
    ];
    const total = branchStockTotal(stock);
    assert.equal(total, 1000 + 500 + 300 + 200 + 100 + 400 + 50);
    const rows = branchBalanceRows(stock, users, branches);
    assert.equal(rows.reduce((t, r) => t + r.petrol + r.diesel, 0), total);

    const by = (name: string) => rows.find((r) => r.name === name);
    assert.deepEqual([by("לוי מיכל")?.petrol, by("לוי מיכל")?.diesel], [1000, 500]);
    assert.equal(by("כהן דני")?.petrol, 300);
    assert.equal(by("פרץ יוסי")?.petrol, 300);
    assert.equal(by("גבאי רון")?.petrol, 400);
    assert.equal(by("מפקח שעזב")?.petrol, 50);
    assert.equal(by("חדד אלון"), undefined, "supervisor without stock or request rights is not listed");
  });
});
