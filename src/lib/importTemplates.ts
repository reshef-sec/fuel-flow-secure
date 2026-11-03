/**
 * Single source of truth for every Excel IMPORT format in the app.
 * The importers (ImportPanel, B2bPanel, ClientsPanel, UsersPanel) and the template downloads
 * (src/lib/excel.ts → downloadImportTemplate) both read these constants, and
 * src/lib/excel.test.ts proves each generated template round-trips through the real parser.
 *
 * DO NOT change column order/labels here without changing the parser — imports must stay
 * byte-for-byte compatible with the files users already have.
 */
import type { B2BClientRecord, Role, UserRecord } from "@/store/appStore";

/* ── Card stock (ImportPanel.handleStock → validateStockSheet) — A..E, header in row 1 ── */
export const templateColumns = [
  { name: "מספר כרטיס", example: "019949" },
  { name: "קוד", example: "••••••" },
  { name: "ערך", example: "100" },
  { name: "סוג", example: "בנזין 95 / סולר" },
  { name: "תוקף", example: "2027-12-31" },
];

/* ── Paz redemption feedback (ImportPanel.handleRedeemed → pazFeedbackCardNumbers) — card number in column A ── */
export const pazFeedbackColumns = [{ name: "מספר כרטיס", example: "019949" }];

/* ── Work vehicles / B2B (B2bPanel.handleFiles → parseWorkVehicleSheet). Exact Excel column order (RTL). ── */
type WorkVehicleKey = Exclude<keyof B2BClientRecord, "isActive">;
export const workVehicleColumns: { key: WorkVehicleKey; label: string; required?: boolean }[] = [
  { key: "standard", label: "תקן", required: true },
  { key: "accountName", label: "שם חשבון", required: true },
  { key: "balance", label: 'יתרת הנה"ש' },
  { key: "clientCode", label: "קוד לקוח", required: true },
  { key: "clientName", label: "שם לקוח", required: true },
  { key: "loadType", label: "סוג העמסה" },
  { key: "branch", label: "סניף", required: true },
  { key: "budgetSection", label: "סעיף תקציבי" },
  { key: "accountKey", label: "מפתח חשבון אב" },
  { key: "itemFamily", label: "משפחת פריטים" },
  { key: "accountStatus", label: "חשבון [פעיל/כותרת]" },
  { key: "accountType", label: "סוג חשבון" },
];
/** Example row for the work-vehicle template (template only — never used by the parser). */
export const workVehicleExample: Partial<Record<WorkVehicleKey, string>> = {
  standard: "80620031",
  accountName: "חשבון לדוגמה",
  clientCode: "5521",
  clientName: "שם לקוח לדוגמה",
  branch: "צפון",
};

/* ── Private vehicles / clients (ClientsPanel.handleFiles) — A..E, header detected by "לקוח" ── */
export const privateVehicleHeaders = ["מס' לקוח", "שם לקוח", "מספר אתר", "שם אתר", "תקן"];
export const privateVehicleExample = ["1001", "שם לקוח לדוגמה", "11", "שם אתר לדוגמה", "תקן 1001"];

/** ClientsPanel row mapping (moved here unchanged so the test exercises the same code). */
export function mapPrivateVehicleRows(raw: string[][]) {
  return raw.map((r) => ({
    clientId: String(r[0] ?? "").trim(),
    clientName: String(r[1] ?? "").trim(),
    siteId: String(r[2] ?? "").trim(),
    siteName: String(r[3] ?? "").trim(),
    standard: String(r[4] ?? "").trim(),
  }));
}

/* ── Users (UsersPanel.handleFile) — 8 columns, header detected by "ת.ז" ── */
export const userImportHeaders = ["סניף", "ת.ז", "משפחה", "פרטי", "הרשאה", "תפקיד", "נייד", "רשאי להקים דרישה"];
export const userImportExample = ["צפון", "123456782", "ישראלי", "ישראל", "מפקח", "מפקח משמרת", "0501234567", "לא"];

export const roleFromLabel = (value: string): Role => {
  const v = value.trim();
  if (v === "אדמין" || v === "admin" || v.includes("אדמין")) return "admin";
  if (v === "מנהל סניף" || v === "branch" || v.includes("סניף")) return "branch";
  if (v === "צופה" || v === "viewer") return "viewer";
  return "supervisor";
};

export const truthy = (value: string) =>
  ["כן", "true", "1", "v", "yes", "✓"].includes(value.trim().toLowerCase());

/** UsersPanel row parsing (moved here unchanged so the test exercises the same code). */
export function parseUserRows(raw: string[][]): UserRecord[] {
  const parsed: UserRecord[] = [];
  for (const r of raw) {
    const [branch = "", id = "", lastName = "", firstName = "", roleCell = "", title = "", phone = "", canReq = ""] = r;
    const cleanId = id.replace(/\D/g, "");
    if (cleanId.length !== 9 || !lastName.trim()) continue;
    parsed.push({
      branch: branch.trim(),
      id: cleanId,
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      role: roleFromLabel(roleCell),
      title: title.trim(),
      phone: phone.trim(),
      canRequest: truthy(canReq),
    });
  }
  return parsed;
}

/* ── Template registry used by downloadImportTemplate() in src/lib/excel.ts ── */
export interface ImportTemplateColumn {
  header: string;
  example?: string;
  required?: boolean;
}

export type ImportTemplateId = "stock" | "paz" | "workVehicles" | "privateVehicles" | "users";

export const IMPORT_TEMPLATES: Record<ImportTemplateId, { fileName: string; columns: ImportTemplateColumn[] }> = {
  stock: {
    fileName: "תבנית-מלאי-כרטיסים.xlsx",
    columns: templateColumns.map((c) => ({ header: c.name, example: c.example, required: true })),
  },
  paz: {
    fileName: "תבנית-היזון-חוזר-פז.xlsx",
    columns: pazFeedbackColumns.map((c) => ({ header: c.name, example: c.example, required: true })),
  },
  workVehicles: {
    fileName: "תבנית-רכב-עבודה.xlsx",
    columns: workVehicleColumns.map((c) => ({ header: c.label, example: workVehicleExample[c.key] ?? "", required: c.required })),
  },
  privateVehicles: {
    fileName: "תבנית-רכב-פרטי.xlsx",
    columns: privateVehicleHeaders.map((h, i) => ({ header: h, example: privateVehicleExample[i], required: true })),
  },
  users: {
    fileName: "תבנית-משתמשים.xlsx",
    columns: userImportHeaders.map((h, i) => ({ header: h, example: userImportExample[i], required: i <= 3 || i === 6 })),
  },
};
