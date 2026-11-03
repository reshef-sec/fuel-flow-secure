/**
 * Excel (.xlsx) generation for templates and reports — redesign 2026.
 *
 * `exceljs` is loaded with a dynamic import so it never lands in the main bundle.
 * The pure builders (`buildTemplateWorkbook`, `buildReportWorkbook`) return an ExcelJS Workbook
 * and work in Node too (see excel.test.ts); the `download*` wrappers add the browser download.
 *
 *   await downloadImportTemplate("stock");                       // any template in IMPORT_TEMPLATES
 *   await downloadTemplate("תבנית.xlsx", [{ header: "מספר כרטיס", example: "019949", required: true }]);
 *   await downloadReport({ fileName: "דוח-רכב-פרטי.xlsx", title: "דוח רכב פרטי — מפורט",
 *     subtitle: "01/10/2026 – 31/10/2026 · סניף צפון", generatedBy: "מאיה קורן",
 *     columns: [{ header: "תאריך", key: "date", type: "date" }, { header: "סכום", key: "amount", type: "money" }],
 *     rows, totals: true });
 */
import type { Workbook, Worksheet } from "exceljs";
import { IMPORT_TEMPLATES, type ImportTemplateColumn, type ImportTemplateId } from "./importTemplates";

/* ───────────────────────── shared ───────────────────────── */

type ExcelModule = typeof import("exceljs");

async function loadExcel(): Promise<ExcelModule> {
  const mod = (await import("exceljs")) as ExcelModule & { default?: ExcelModule };
  return mod.Workbook ? mod : (mod.default as ExcelModule);
}

const BRAND = "רשף ביטחון";
const FONT = "Arial";
const NAVY = "FF0B1140";
const NAVY_2 = "FF16215E";
const MUTED = "FF566172";
const LINE = "FFE0E6EF";
const ZEBRA = "FFF7F9FC";
const TOTALS_BG = "FFEEF2F7";
const MINT = "FF45CDBA";

/** Excel number formats used across the app. */
export const EXCEL_FORMATS = {
  money: '#,##0" ₪";-#,##0" ₪"',
  number: "#,##0",
  date: "dd/mm/yyyy",
  text: "@",
} as const;

const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

const ensureXlsx = (name: string) => (/\.xlsx$/i.test(name) ? name : `${name}.xlsx`);

/** Serialises a workbook to an ArrayBuffer (.xlsx). */
export async function workbookToBuffer(wb: Workbook): Promise<ArrayBuffer> {
  const buf = await wb.xlsx.writeBuffer();
  const view = buf as unknown as Uint8Array;
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

/** Triggers a browser download of a workbook. */
export async function saveWorkbook(wb: Workbook, fileName: string): Promise<void> {
  const buffer = await workbookToBuffer(wb);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ensureXlsx(fileName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "DD/MM/YYYY HH:mm" in Israel time. */
function stamp(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

/** Accepts Date | "YYYY-MM-DD[...]" | "DD/MM/YYYY" | "DD.MM.YY" and returns a UTC-midnight Date (Excel-safe), else null. */
export function toExcelDate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value ?? "").replace(/[₪,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ───────────────────────── templates ───────────────────────── */

export type TemplateColumn = ImportTemplateColumn & { width?: number };

/**
 * Builds an import template: RTL sheet, header in row 1 (exact labels the importer expects),
 * optional example row 2, text-formatted columns (keeps leading zeros), frozen header.
 * Required columns get the navy header; optional ones a lighter navy.
 */
export async function buildTemplateWorkbook(columns: readonly TemplateColumn[], sheetName = "תבנית"): Promise<Workbook> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND;
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName, {
    views: [{ rightToLeft: true, state: "frozen", xSplit: 0, ySplit: 1, activeCell: "A2" }],
  });

  ws.columns = columns.map((c) => ({
    width: c.width ?? Math.min(40, Math.max(14, c.header.length + 6, (c.example ?? "").length + 4)),
    style: { numFmt: EXCEL_FORMATS.text, font: { name: FONT, size: 11 } },
  }));

  const header = ws.getRow(1);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(c.required === false || c.required === undefined ? NAVY_2 : NAVY);
    cell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
    cell.border = { bottom: { style: "medium", color: { argb: MINT } } };
  });
  header.height = 24;

  if (columns.some((c) => c.example)) {
    const row = ws.getRow(2);
    columns.forEach((c, i) => {
      if (!c.example) return;
      const cell = row.getCell(i + 1);
      cell.value = c.example; // always text: card numbers / IDs must keep leading zeros
      cell.numFmt = EXCEL_FORMATS.text;
      cell.font = { name: FONT, size: 11, color: { argb: MUTED } };
      cell.alignment = { horizontal: "right", readingOrder: "rtl" };
    });
  }
  return wb;
}

/** Downloads an import template as a real .xlsx. */
export async function downloadTemplate(fileName: string, columns: readonly TemplateColumn[]): Promise<void> {
  await saveWorkbook(await buildTemplateWorkbook(columns), fileName);
}

/** Downloads one of the registered import templates (same constants the importers use). */
export async function downloadImportTemplate(id: ImportTemplateId): Promise<void> {
  const t = IMPORT_TEMPLATES[id];
  await downloadTemplate(t.fileName, t.columns);
}

/* ───────────────────────── reports ───────────────────────── */

export type ReportColumnType = "text" | "money" | "date" | "number";

export interface ReportColumn<Row = Record<string, unknown>> {
  header: string;
  /** Property read from each row (ignored when `get` is given). */
  key: string;
  type: ReportColumnType;
  /** Column width in characters (default: auto from header/content). */
  width?: number;
  /** Optional accessor instead of `row[key]`. */
  get?: (row: Row) => unknown;
}

export interface ReportSpec<Row = Record<string, unknown>> {
  fileName: string;
  /** e.g. "דוח רכב פרטי — מפורט" */
  title: string;
  /** Date range / filters line, e.g. "01/10/2026 – 31/10/2026 · כל הסניפים" */
  subtitle?: string;
  /** Name of the user who produced the report. */
  generatedBy?: string;
  /** Defaults to now. */
  generatedAt?: Date;
  columns: ReportColumn<Row>[];
  rows: readonly Row[];
  /**
   * Totals row: `true` sums every money/number column; or pass explicit values per key
   * (numbers are formatted by the column type, strings shown as-is). Label "סה״כ" goes in the first column
   * unless that column has a value.
   */
  totals?: boolean | Partial<Record<string, number | string>>;
  sheetName?: string;
}

/** Row index (1-based) of the table header inside a report sheet. */
export const REPORT_HEADER_ROW = 6;

/**
 * Builds a professional RTL report workbook:
 * rows 1–4 brand header (רשף ביטחון · title · range/filters · generated at/by), row 6 navy header
 * with white bold text (frozen), zebra data rows, ₪ / DD/MM/YYYY formats, auto-filter, widths, bold totals.
 */
export async function buildReportWorkbook<Row = Record<string, unknown>>(spec: ReportSpec<Row>): Promise<Workbook> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = spec.generatedBy || BRAND;
  wb.created = spec.generatedAt ?? new Date();
  wb.title = spec.title;
  const cols = spec.columns;
  const n = Math.max(1, cols.length);
  const H = REPORT_HEADER_ROW;

  const ws: Worksheet = wb.addWorksheet(spec.sheetName ?? "דוח", {
    views: [{ rightToLeft: true, state: "frozen", xSplit: 0, ySplit: H, activeCell: `A${H + 1}` }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    properties: { defaultRowHeight: 20 },
  });

  const valueOf = (row: Row, c: ReportColumn<Row>) => (c.get ? c.get(row) : (row as Record<string, unknown>)[c.key]);
  const formatOf = (t: ReportColumnType) => (t === "money" ? EXCEL_FORMATS.money : t === "number" ? EXCEL_FORMATS.number : t === "date" ? EXCEL_FORMATS.date : undefined);
  const convert = (t: ReportColumnType, v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    if (t === "money" || t === "number") return toNumber(v) ?? String(v);
    if (t === "date") return toExcelDate(v) ?? String(v);
    return String(v);
  };

  // Widths: explicit, else from header and longest rendered value.
  ws.columns = cols.map((c) => {
    if (c.width) return { width: c.width };
    let longest = c.header.length;
    for (const r of spec.rows.slice(0, 500)) {
      const v = valueOf(r, c);
      const len = c.type === "date" ? 10 : c.type === "money" ? String(v ?? "").length + 4 : String(v ?? "").length;
      if (len > longest) longest = len;
    }
    return { width: Math.min(48, Math.max(c.type === "date" ? 13 : 11, longest + 3)) };
  });

  // Brand header block (rows 1–4), merged across the table width.
  const block: [string, Partial<import("exceljs").Font>, number][] = [
    [BRAND, { name: FONT, bold: true, size: 16, color: { argb: NAVY } }, 26],
    [spec.title, { name: FONT, bold: true, size: 13, color: { argb: NAVY_2 } }, 22],
    [spec.subtitle ?? "", { name: FONT, size: 11, color: { argb: MUTED } }, 18],
    [`הופק בתאריך ${stamp(spec.generatedAt ?? new Date())}${spec.generatedBy ? ` · על ידי ${spec.generatedBy}` : ""}`, { name: FONT, size: 10, color: { argb: MUTED } }, 18],
  ];
  block.forEach(([text, font, height], i) => {
    const r = i + 1;
    if (n > 1) ws.mergeCells(r, 1, r, n);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = font;
    cell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
    ws.getRow(r).height = height;
  });
  // Mint accent under the brand block.
  for (let c = 1; c <= n; c++) ws.getCell(4, c).border = { bottom: { style: "medium", color: { argb: MINT } } };

  // Header row.
  const header = ws.getRow(H);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(NAVY);
    cell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: NAVY } } };
  });
  header.height = 26;

  // Data rows.
  spec.rows.forEach((row, idx) => {
    const r = ws.getRow(H + 1 + idx);
    cols.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      cell.value = convert(c.type, valueOf(row, c)) as never;
      const fmt = formatOf(c.type);
      if (fmt) cell.numFmt = fmt;
      cell.font = { name: FONT, size: 11 };
      cell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
      cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
      if (idx % 2 === 1) cell.fill = solid(ZEBRA);
    });
  });

  const lastData = H + spec.rows.length;
  ws.autoFilter = { from: { row: H, column: 1 }, to: { row: Math.max(H, lastData), column: n } };

  // Totals.
  if (spec.totals) {
    const r = ws.getRow(lastData + 1);
    const explicit = spec.totals === true ? {} : spec.totals;
    cols.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      let v: unknown = explicit[c.key];
      if (v === undefined && spec.totals === true && (c.type === "money" || c.type === "number")) {
        v = spec.rows.reduce<number>((sum, row) => sum + (toNumber(valueOf(row, c)) ?? 0), 0);
      }
      if (v === undefined && i === 0) v = "סה״כ";
      if (v !== undefined) {
        cell.value = (typeof v === "number" ? v : String(v)) as never;
        const fmt = typeof v === "number" ? formatOf(c.type) ?? EXCEL_FORMATS.number : undefined;
        if (fmt) cell.numFmt = fmt;
      }
      cell.font = { name: FONT, bold: true, size: 11, color: { argb: NAVY } };
      cell.fill = solid(TOTALS_BG);
      cell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
      cell.border = { top: { style: "medium", color: { argb: NAVY } } };
    });
    r.height = 24;
  }

  return wb;
}

/** Builds and downloads a report workbook. */
export async function downloadReport<Row = Record<string, unknown>>(spec: ReportSpec<Row>): Promise<void> {
  await saveWorkbook(await buildReportWorkbook(spec), spec.fileName);
}
