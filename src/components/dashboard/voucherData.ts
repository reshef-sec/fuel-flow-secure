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
  /** דורש ההקצאה — user who requested the allocation */
  requester?: string;
  /** גורם מאשר — admin who approved / executed the allocation */
  approver?: string;

  /* ---- End-worker issuance details (billing report) ---- */
  /** מס' לקוח */
  clientId?: string;
  /** מספר אתר */
  siteId?: string;
  /** שם אתר */
  siteName?: string;
  /** סיבת הפקה */
  reason?: string;
  /** שם עובד */
  workerName?: string;
  /** ת.ז עובד */
  workerId?: string;
  /** תאריך מסירה לעובד */
  deliveredAt?: string;
}

/** True for vouchers handed to an end worker (billing-relevant). */
export const isWorkerVoucher = (v: VoucherRecord) =>
  Boolean(v.workerId || v.workerName) || v.status === "הוקצה לעובד";

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

  /* ---- Vouchers handed to end workers (feed the "דוח קש פז" billing report) ---- */
  {
    serial: "700114", realCode: "RB-7001-1140", amount: 100, branch: "צפון", supervisor: "שני רפי",
    status: "הוקצה לעובד", updatedAt: "2026-09-15", deliveredAt: "2026-09-15",
    client: "מזרחי טפחות שרותי אבטחה", clientId: "38", siteId: "74", siteName: 'לב העיר פ"ת 550-אבטחה',
    reason: "סיור ניידות", workerName: "לוי אדיר", workerId: "034044487",
    requester: "לוי אדיר", approver: "קלדרון רון",
  },
  {
    serial: "700221", realCode: "RB-7002-2215", amount: 200, branch: "ירושלים", supervisor: "חטיבי ניר",
    status: "הוקצה לעובד", updatedAt: "2026-09-14", deliveredAt: "2026-09-14",
    client: "מזרחי טפחות שרותי אבטחה", clientId: "38", siteId: "76", siteName: "חזון איש-אבטחה",
    reason: "חידוש מלאי שוטף", workerName: "אזרואל מאיר", workerId: "043369339",
    requester: "חטיבי ניר", approver: "בני תמי",
  },
  {
    serial: "700338", realCode: "RB-7003-3382", amount: 100, branch: "דרום", supervisor: "כחלוני עוז",
    status: "מומש סופית", updatedAt: "2026-09-12", deliveredAt: "2026-09-10",
    client: "מזרחי טפחות שרותי אבטחה", clientId: "38", siteId: "109", siteName: "סמילנסקי נתניה-אבטחה מזדמנת",
    reason: "אירוע חריג", workerName: "רבינוביץ אבי", workerId: "208268425",
    requester: "אלמקייס חיים", approver: "קלדרון רון",
  },
  {
    serial: "700447", realCode: "RB-7004-4471", amount: 300, branch: "מרכז", supervisor: "נגר רביב",
    status: "הוקצה לעובד", updatedAt: "2026-09-09", deliveredAt: "2026-09-09",
    client: "מזרחי טפחות שרותי אבטחה", clientId: "38", siteId: "115", siteName: "פארק המדע רחובות-אבטחה",
    reason: "הקצאה חד פעמית", workerName: "נגר רביב", workerId: "028547099",
    requester: "קשי עופר", approver: "נמדר שגאל",
  },
  {
    serial: "700556", realCode: "RB-7005-5568", amount: 100, branch: "שפלה", supervisor: "שני רפי",
    status: "הוקצה לעובד", updatedAt: "2026-09-08", deliveredAt: "2026-09-08",
    client: "מזרחי טפחות שרותי אבטחה", clientId: "38", siteId: "127", siteName: "אופקים 437-אבטחה",
    reason: "סיור ניידות", workerName: "שני רפי", workerId: "033237454",
    approver: "לוגסי איתן",
  },
];
