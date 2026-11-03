import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkVehicleHeader, parseWorkVehicleSheet } from "./workVehicleSheet";
const columns = [{key:"standard",label:"תקן"},{key:"clientCode",label:"קוד לקוח"},{key:"clientName",label:"שם לקוח"},{key:"balance",label:'יתרת הנה"ש'}];
describe("work vehicle Excel headers", () => {
  it("detects the header in each of the first five rows", () => {
    for (let index=0;index<5;index++) {
      const rows = parseWorkVehicleSheet([...Array.from({length:index},()=>["דוח רכבים"]),["תקן","קוד לקוח","שם לקוח"],["80620031","C1","לקוח"]],columns);
      assert.equal(rows[0]?.standard,"80620031");
      assert.equal(rows[0]?.clientCode,"C1");
    }
  });
  it("ignores punctuation, quotes and invisible Excel direction markers", () => {
    for (const label of ['יתרת הנה"ש','יתרת הנה״ש','יתרת הנהש']) assert.equal(normalizeWorkVehicleHeader(label),"יתרתהנהש");
    const rows=parseWorkVehicleSheet([["\uFEFFמס׳ תקן:","\u200Fקוד־לקוח"," שם הלקוח ","יתרת הנה״ש"],["80620031","C1","לקוח","500"]],columns);
    assert.deepEqual(rows[0],{standard:"80620031",clientCode:"C1",clientName:"לקוח",balance:"500"});
  });
  it("accepts absent optional columns without blocking valid identities", () => {
    assert.equal(parseWorkVehicleSheet([["תקן","קוד לקוח","שם לקוח","עמודה אחרת"],["80620031","C1","לקוח","x"]],columns)[0]?.balance,"");
  });
  it("rejects a header past row five and missing core columns", () => {
    assert.throws(()=>parseWorkVehicleSheet([...Array.from({length:5},()=>[""]),["תקן","קוד לקוח","שם לקוח"]],columns));
    assert.throws(()=>parseWorkVehicleSheet([["תקן","קוד לקוח"]],columns));
  });
});