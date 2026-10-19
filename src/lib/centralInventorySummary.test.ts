import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCentralInventorySummary } from "./centralInventorySummary";

describe("database central inventory summary", () => {
  it("reads the database 2000 NIS total without substituting saved budget", () => {
    assert.deepEqual(parseCentralInventorySummary([{ total_available_amount: "2000", gasoline_amount: "1900", diesel_amount: "100" }]),
      { total_available_amount: 2000, gasoline_amount: 1900, diesel_amount: 100 });
  });
  it("rejects a total inconsistent with the fuel breakdown", () => {
    assert.throws(() => parseCentralInventorySummary([{ total_available_amount: 5600, gasoline_amount: 3800, diesel_amount: 0 }]));
  });
  it("does not turn unavailable database results into a zero balance", () => {
    assert.throws(() => parseCentralInventorySummary([]));
    assert.throws(() => parseCentralInventorySummary([{ total_available_amount: null, gasoline_amount: 0, diesel_amount: 0 }]));
  });
});