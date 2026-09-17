export type VoucherStatus = "מומש סופית" | "טרם שומש" | "חסום" | "הוקצה לעובד";

export const MAIN_POOL = "מאגר ראשי";

export interface VoucherRecord {
  serial: string;
  /** Real code printed on the voucher */
  realCode: string;
  amount: number;
  /** "מאגר ראשי" or a branch name */
  branch: string;
  /** Supervisor currently holding the voucher, if any */
  supervisor?: string;
  client?: string;
  status: VoucherStatus;
  updatedAt: string;
}

/** "מאגר ראשי" | "צפון" | "סניף צפון (מפקח דן)" */
export function formatAssignment(v: { branch: string; supervisor?: string }) {
  return v.supervisor ? `${v.branch} (${v.supervisor})` : v.branch;
}

export const vouchers: VoucherRecord[] = [
  { serial: "019949", realCode: "RB-4417-9902", amount: 150, branch: "צפון", status: "טרם שומש", updatedAt: "2026-08-31" },
  { serial: "271008", realCode: "RB-8823-1140", amount: 500, branch: "צפון", supervisor: "שני רפי", client: "לקוח - אתר 1", status: "מומש סופית", updatedAt: "2026-08-30" },
  { serial: "225902", realCode: "RB-1092-7731", amount: 100, branch: MAIN_POOL, status: "טרם שומש", updatedAt: "2026-08-30" },
  { serial: "225393", realCode: "RB-5540-2218", amount: 200, branch: "ירושלים", status: "חסום", updatedAt: "2026-08-29" },
  { serial: "012345", realCode: "RB-7781-6653", amount: 150, branch: "מרכז", supervisor: "נגר רביב", client: "לקוח - אתר 2", status: "מומש סופית", updatedAt: "2026-08-28" },
  { serial: "104772", realCode: "RB-3391-8842", amount: 300, branch: "דרום", supervisor: "נגר רביב", status: "טרם שומש", updatedAt: "2026-08-27" },
  { serial: "556978", realCode: "RB-2274-9915", amount: 500, branch: MAIN_POOL, status: "טרם שומש", updatedAt: "2026-08-26" },
  { serial: "318508", realCode: "RB-6612-3308", amount: 100, branch: "דרום", status: "מומש סופית", updatedAt: "2026-08-25" },
  { serial: "224470", realCode: "RB-9903-5521", amount: 200, branch: "צפון", status: "חסום", updatedAt: "2026-08-24" },
  { serial: "889201", realCode: "RB-4438-7702", amount: 150, branch: "שפלה", supervisor: "שני רפי", client: "לקוח - אתר 3", status: "מומש סופית", updatedAt: "2026-08-23" },
  { serial: "440318", realCode: "RB-1157-4460", amount: 500, branch: "שפלה", status: "טרם שומש", updatedAt: "2026-08-22" },
  { serial: "660112", realCode: "RB-7729-1183", amount: 100, branch: MAIN_POOL, status: "טרם שומש", updatedAt: "2026-08-21" },
  { serial: "773094", realCode: "RB-5583-2296", amount: 300, branch: "מרכז", status: "מומש סופית", updatedAt: "2026-08-20" },
  { serial: "915663", realCode: "RB-3306-8814", amount: 200, branch: "ירושלים", supervisor: "נגר רביב", status: "חסום", updatedAt: "2026-08-19" },
  { serial: "102938", realCode: "RB-8890-4472", amount: 150, branch: "ירושלים", status: "טרם שומש", updatedAt: "2026-08-18" },
  { serial: "483920", realCode: "RB-2218-6639", amount: 500, branch: "דרום", client: "לקוח - אתר 2", status: "מומש סופית", updatedAt: "2026-08-17" },
  { serial: "572011", realCode: "RB-6674-1125", amount: 100, branch: "שפלה", supervisor: "שני רפי", status: "טרם שומש", updatedAt: "2026-08-16" },
  { serial: "639874", realCode: "RB-4451-9938", amount: 200, branch: MAIN_POOL, status: "טרם שומש", updatedAt: "2026-08-15" },
];
