import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { preparePrivateVehicles, privateVehicleKey } from "./privateVehicles";
import { historicalClientName, isActiveClient } from "./importIntegrity";
describe("private vehicle snapshot", () => {
  it("keeps the first duplicate client/site row after trimming", () => {
    const result = preparePrivateVehicles([{clientId:" 1001 ",siteId:" 11 ",clientName:"First"},{clientId:"1001",siteId:"11",clientName:"Last"}]);
    assert.equal(result.duplicates,1);
    assert.deepEqual(result.rows,[{clientId:"1001",siteId:"11",clientName:"First"}]);
  });
  it("keeps distinct sites of a client and distinct clients at a site", () => {
    const result=preparePrivateVehicles([{clientId:"1001",siteId:"11"},{clientId:"1001",siteId:"12"},{clientId:"1002",siteId:"11"}]);
    assert.equal(result.rows.length,3);
    assert.equal(new Set(result.rows.map(privateVehicleKey)).size,3);
  });
  it("skips completely blank rows without discarding valid keys", () => {
    const result=preparePrivateVehicles([{clientId:" ",siteId:"",clientName:""},{clientId:"1001",siteId:"11",clientName:""}]);
    assert.equal(result.blanks,1);
    assert.equal(result.rows.length,1);
  });
  it("rejects empty and incomplete snapshots before any deactivation", () => {
    assert.throws(()=>preparePrivateVehicles([]));
    assert.throws(()=>preparePrivateVehicles([{clientId:"1001",siteId:""}]),/מספר לקוח ומספר אתר/);
  });
  it("retains inactive private history but excludes inactive rows from issuance", () => {
    const clients=[{clientId:"1001",siteId:"11",clientName:"Historical",isActive:false}];
    assert.equal(historicalClientName({clientId:"1001",siteId:"11"},clients,[]),"Historical");
    assert.equal(isActiveClient(clients[0]),false);
  });
});