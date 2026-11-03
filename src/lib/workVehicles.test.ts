import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepareWorkVehicles, workVehicleKey } from "./workVehicles";
describe("work vehicle identity and snapshot", () => {
  it("keeps the first duplicate standard/client row, not the last", () => {
    const result = prepareWorkVehicles([{standard:" 80620031 ",clientCode:" C1 ",accountName:"First"},{standard:"80620031",clientCode:"C1",accountName:"Last"}]);
    assert.equal(result.duplicates, 1);
    assert.deepEqual(result.rows, [{standard:"80620031",clientCode:"C1",accountName:"First"}]);
  });
  it("keeps different vehicles sharing a client and account", () => {
    const result = prepareWorkVehicles([{standard:"80620031",clientCode:"C1",accountName:"Shared"},{standard:"80620032",clientCode:"C1",accountName:"Shared"}]);
    assert.equal(result.rows.length, 2);
    assert.notEqual(workVehicleKey(result.rows[0]),workVehicleKey(result.rows[1]));
  });
  it("skips wholly blank rows and accepts a key without an account name", () => {
    const result = prepareWorkVehicles([{standard:" ",clientCode:"",accountName:""},{standard:"80620031",clientCode:"C1",accountName:""}]);
    assert.equal(result.blanks, 1);
    assert.equal(result.rows.length, 1);
  });
  it("rejects empty or entirely invalid snapshots before deactivation", () => {
    assert.throws(()=>prepareWorkVehicles([]));
    assert.throws(()=>prepareWorkVehicles([{standard:"",clientCode:"C1"}]),/לא נמצאו רכבי עבודה תקינים/);
  });
  it("skips row 38 missing a standard and processes every valid vehicle", () => {
    const input = Array.from({length: 39}, (_, i) => ({standard: String(80620000+i),clientCode:"C1"}));
    input[37] = {standard:" ",clientCode:"C1"};
    const result = prepareWorkVehicles(input);
    assert.equal(result.rows.length,38);
    assert.equal(result.invalid,1);
    assert.equal(result.skipped,1);
    assert.equal(result.rows[37]?.standard,"80620038");
  });
  it("counts missing keys separately from blanks and duplicates", () => {
    const result = prepareWorkVehicles([{standard:"",clientCode:""},{standard:"",clientCode:"C1"},{standard:"80620031",clientCode:""},{standard:"80620032",clientCode:"C1"},{standard:"80620032",clientCode:"C1"}]);
    assert.equal(result.blanks,1);
    assert.equal(result.invalid,2);
    assert.equal(result.skipped,3);
    assert.equal(result.duplicates,1);
    assert.equal(result.rows.length,1);
  });
});