import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReportWorkbook, buildTemplateWorkbook, EXCEL_FORMATS, REPORT_HEADER_ROW, toExcelDate, workbookToBuffer } from "./excel";
import {
  IMPORT_TEMPLATES,
  mapPrivateVehicleRows,
  parseUserRows,
  privateVehicleHeaders,
  templateColumns,
  userImportHeaders,
  workVehicleColumns,
} from "./importTemplates";
import { parseSheetFile, stripHeader } from "./parseSheet";
import { validateStockSheet } from "./validateStockSheet";
import { pazFeedbackCardNumbers, pazCardMatchKey } from "./importIntegrity";
import { parseWorkVehicleSheet } from "./workVehicleSheet";
import { prepareWorkVehicles } from "./workVehicles";
import { preparePrivateVehicles } from "./privateVehicles";

/** Generates the template and reads it back exactly like the app's importers do (parseSheetFile → xlsx). */
async function roundTrip(id: keyof typeof IMPORT_TEMPLATES): Promise<string[][]> {
  const wb = await buildTemplateWorkbook(IMPORT_TEMPLATES[id].columns);
  const file = new File([await workbookToBuffer(wb)], IMPORT_TEMPLATES[id].fileName);
  return parseSheetFile(file);
}

describe("import templates round-trip through the real parsers", () => {
  it("card stock template passes validateStockSheet with the example row", async () => {
    const rows = await roundTrip("stock");
    assert.deepEqual(rows[0], templateColumns.map((c) => c.name));
    const checked = validateStockSheet(rows);
    assert.ok(Array.isArray(checked), `validateStockSheet rejected the template: ${String(checked)}`);
    assert.equal(checked.length, 1);
    assert.equal(checked[0]?.[0], "019949", "leading zeros of the card number survive");
    assert.equal(checked[0]?.[2], "100");
  });

  it("Paz feedback template: column A 'מספר כרטיס' yields the example card", async () => {
    const rows = await roundTrip("paz");
    assert.equal(rows[0]?.[0], "מספר כרטיס");
    const serials = pazFeedbackCardNumbers(stripHeader(rows, "כרטיס"));
    assert.deepEqual(serials, [pazCardMatchKey("019949")]);
  });

  it("work vehicle template matches B2bPanel columns and parses", async () => {
    const rows = await roundTrip("workVehicles");
    assert.deepEqual(rows[0], workVehicleColumns.map((c) => c.label));
    const parsed = parseWorkVehicleSheet(rows, workVehicleColumns);
    assert.equal(parsed.length, 1);
    for (const c of workVehicleColumns.filter((col) => col.required)) assert.ok(parsed[0]?.[c.key], `required ${c.label} filled`);
    const prepared = prepareWorkVehicles(parsed);
    assert.equal(prepared.rows.length, 1);
    assert.equal(prepared.rows[0]?.standard, "80620031");
  });

  it("private vehicle template (A–E incl. תקן) parses with the ClientsPanel mapping", async () => {
    const rows = await roundTrip("privateVehicles");
    assert.deepEqual(rows[0], privateVehicleHeaders);
    const mapped = mapPrivateVehicleRows(stripHeader(rows, "לקוח"));
    assert.deepEqual(mapped, [{ clientId: "1001", clientName: "שם לקוח לדוגמה", siteId: "11", siteName: "שם אתר לדוגמה", standard: "תקן 1001" }]);
    assert.equal(preparePrivateVehicles(mapped).rows.length, 1);
  });

  it("users template (8 columns) parses with the UsersPanel mapping", async () => {
    const rows = await roundTrip("users");
    assert.deepEqual(rows[0], userImportHeaders);
    const users = parseUserRows(stripHeader(rows, "אימייל"));
    assert.equal(users.length, 1);
    assert.equal(users[0]?.email, "israel@outlook.com");
    assert.ok(users[0]?.id);
    assert.equal(users[0]?.role, "supervisor");
    assert.equal(users[0]?.canRequest, false);
  });
});

describe("template workbook format", () => {
  it("is RTL with a frozen, styled header and text-formatted columns", async () => {
    const wb = await buildTemplateWorkbook(IMPORT_TEMPLATES.stock.columns);
    const ws = wb.worksheets[0]!;
    const view = ws.views[0] as { rightToLeft?: boolean; state?: string; ySplit?: number };
    assert.equal(view.rightToLeft, true);
    assert.equal(view.state, "frozen");
    assert.equal(view.ySplit, 1);
    assert.equal(ws.getCell("A1").font?.bold, true);
    assert.equal(ws.getCell("A2").numFmt, EXCEL_FORMATS.text);
  });
});

describe("report workbook", () => {
  const spec = {
    fileName: "report.xlsx",
    title: "דוח רכב פרטי — מפורט",
    subtitle: "01/10/2026 – 31/10/2026 · כל הסניפים",
    generatedBy: "מאיה קורן",
    generatedAt: new Date("2026-11-04T08:30:00Z"),
    columns: [
      { header: "מספר כרטיס", key: "serial", type: "text" as const },
      { header: "תאריך", key: "date", type: "date" as const },
      { header: "כמות", key: "count", type: "number" as const },
      { header: "סכום", key: "amount", type: "money" as const },
    ],
    rows: [
      { serial: "019949", date: "2026-10-03", count: 2, amount: 600 },
      { serial: "019950", date: "15/10/2026", count: 1, amount: "1,500" },
    ],
    totals: true as const,
  };

  it("has brand rows, navy frozen header, formats, auto-filter and totals", async () => {
    // Round-trip through a real buffer to make sure the file itself is valid.
    const built = await buildReportWorkbook(spec);
    const ExcelJS = (await import("exceljs")) as unknown as { Workbook?: new () => import("exceljs").Workbook; default?: { Workbook: new () => import("exceljs").Workbook } };
    const Ctor = ExcelJS.Workbook ?? ExcelJS.default!.Workbook;
    const wb = new Ctor();
    await wb.xlsx.load(await workbookToBuffer(built));
    const ws = wb.worksheets[0]!;
    const H = REPORT_HEADER_ROW;

    assert.equal(ws.getCell("A1").value, "רשף ביטחון");
    assert.equal(ws.getCell("A2").value, spec.title);
    assert.equal(ws.getCell("A3").value, spec.subtitle);
    assert.match(String(ws.getCell("A4").value), /04\/11\/2026 10:30 · על ידי מאיה קורן/);

    const view = ws.views[0] as { rightToLeft?: boolean; state?: string; ySplit?: number };
    assert.equal(view.rightToLeft, true);
    assert.equal(view.state, "frozen");
    assert.equal(view.ySplit, H);

    const head = ws.getRow(H);
    assert.deepEqual([1, 2, 3, 4].map((c) => head.getCell(c).value), ["מספר כרטיס", "תאריך", "כמות", "סכום"]);
    assert.equal(head.getCell(1).font?.bold, true);
    assert.equal(head.getCell(1).font?.color?.argb, "FFFFFFFF");
    assert.equal((head.getCell(1).fill as { fgColor?: { argb?: string } }).fgColor?.argb, "FF0B1140");

    assert.equal(ws.getCell(H + 1, 1).value, "019949");
    assert.equal(ws.getCell(H + 1, 2).numFmt, EXCEL_FORMATS.date);
    assert.equal((ws.getCell(H + 1, 2).value as Date).toISOString().slice(0, 10), "2026-10-03");
    assert.equal((ws.getCell(H + 2, 2).value as Date).toISOString().slice(0, 10), "2026-10-15");
    assert.equal(ws.getCell(H + 1, 4).numFmt, EXCEL_FORMATS.money);
    assert.equal(ws.getCell(H + 2, 4).value, 1500);

    const totals = ws.getRow(H + 3);
    assert.equal(totals.getCell(1).value, "סה״כ");
    assert.equal(totals.getCell(3).value, 3);
    assert.equal(totals.getCell(4).value, 2100);
    assert.equal(totals.getCell(4).font?.bold, true);

    assert.ok(ws.autoFilter, "auto-filter set");
    assert.ok((ws.getColumn(1).width ?? 0) >= 11);
  });

  it("toExcelDate handles ISO, Israeli and invalid input", () => {
    assert.equal(toExcelDate("2026-01-31")?.toISOString().slice(0, 10), "2026-01-31");
    assert.equal(toExcelDate("31/01/2026")?.toISOString().slice(0, 10), "2026-01-31");
    assert.equal(toExcelDate("31.01.26")?.toISOString().slice(0, 10), "2026-01-31");
    assert.equal(toExcelDate("nope"), null);
  });
});
