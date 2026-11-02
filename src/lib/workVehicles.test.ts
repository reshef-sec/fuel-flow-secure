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
  it("rejects empty or incomplete snapshots before deactivation", () => {
    assert.throws(()=>prepareWorkVehicles([]));
    assert.throws(()=>prepareWorkVehicles([{standard:"",clientCode:"C1"}]),/תקן וקוד לקוח/);
  });
});