import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCentralInventorySummary, parseCentralInventorySnapshot } from "./centralInventorySummary";

describe("database central inventory summary", () => {
  it("includes 150, 200 and 300 denominations and reconciles both 1500 fuel totals to 3000", () => {
    const denominations = [300,50,200,100,150,700].flatMap(amount => ["בנזין","סולר"].map(fuel_type => ({amount,count:1,fuel_type})));
    const result=parseCentralInventorySnapshot({total_available_amount:3000,gasoline_amount:1500,diesel_amount:1500,denominations});
    assert.deepEqual([...new Set(result.denominations?.map(row=>row.amount))],[50,100,150,200,300,700]);
    assert.equal(result.denominations?.reduce((sum,row)=>sum+row.amount*row.count,0),3000);
  });
  it("rejects a 2250 denomination breakdown when the summary reports 3000", () => {
    assert.throws(()=>parseCentralInventorySnapshot({total_available_amount:3000,gasoline_amount:1500,diesel_amount:1500,denominations:[{amount:100,count:11,fuel_type:"בנזין"},{amount:50,count:23,fuel_type:"סולר"}]}));
  });
  it("accepts empty stock only with zero totals and does not fall back when counts are absent", () => {
    assert.deepEqual(parseCentralInventorySnapshot({total_available_amount:0,gasoline_amount:0,diesel_amount:0,denominations:[]}).denominations,[]);
    assert.throws(()=>parseCentralInventorySnapshot({total_available_amount:0,gasoline_amount:0,diesel_amount:0}));
  });
  it("uses 20 gasoline cards worth 100 NIS each as a 2000 NIS central balance", () => {
    const summary = parseCentralInventorySummary([{ total_available_amount: 20 * 100, gasoline_amount: 20 * 100, diesel_amount: 0 }]);
    assert.equal(summary.total_available_amount, 2000);
    assert.equal(summary.gasoline_amount, 2000);
    assert.equal(summary.diesel_amount, 0);
  });
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