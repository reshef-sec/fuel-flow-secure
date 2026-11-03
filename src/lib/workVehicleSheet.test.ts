import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkVehicleHeader, parseWorkVehicleSheet } from "./workVehicleSheet";
import { parseSheetFile } from "./parseSheet";
import { prepareWorkVehicles } from "./workVehicles";
const columns = [{key:"standard",label:"תקן"},{key:"clientCode",label:"קוד לקוח"},{key:"clientName",label:"שם לקוח"},{key:"balance",label:'יתרת הנה"ש'}] as const;
describe("work vehicle Excel headers", () => {
  it("maps column A account code to standard with client code in D and name in E", () => {
    for (const standardHeader of ["קוד חשבון", "תקן", " \u200Fקוד־חשבון: "]) {
      const prepared = prepareWorkVehicles(parseWorkVehicleSheet([
        [standardHeader,"שם חשבון",'יתרת הנה"ש',"קוד לקוח","שם לקוח"],
        ["80620031","חשבון","500","C1","לקוח ראשון"],
        ["80620032","חשבון","100","C1","לקוח שני"],
        ["","","","",""],
        [],
      ],columns));
      assert.deepEqual(prepared.rows.map(row => [row.standard,row.clientCode,row.clientName]),[
        ["80620031","C1","לקוח ראשון"],["80620032","C1","לקוח שני"],
      ]);
      assert.equal(prepared.blanks,2);
      assert.equal(prepared.invalid,0);
    }
  });
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
  it("reads a real Excel upload with a title, punctuation and skipped missing keys", async () => {
    const XLSX = await import("xlsx");
    const workbook=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([["רשימת רכבי עבודה"],[],["\u200Fתקן:","קוד-לקוח","שם לקוח","יתרת הנה״ש"],["80620031","C1","לקוח","500"],["","C1","חסר תקן"],["80620032","C1","לקוח","100"]]),"רכבים");
    const file=new File([XLSX.write(workbook,{type:"array",bookType:"xlsx"})],"vehicles.xlsx");
    const prepared=prepareWorkVehicles(parseWorkVehicleSheet(await parseSheetFile(file),columns));
    assert.equal(prepared.rows.length,2);
    assert.equal(prepared.invalid,1);
    assert.equal(prepared.rows[0]?.balance,"500");
  });
});