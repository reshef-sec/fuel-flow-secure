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
  /** טלפון עובד */
  workerPhone?: string;
  /** ISO timestamp when handed to the employee; expiry starts here. */
  issuedAt?: string;
  /** ISO timestamp — 3 months after issuedAt. */
  expiresAt?: string;
  /** Auth user id of the supervisor holding / issuing the voucher. */
  supervisorId?: string;

  /* ---- Issuance route ---- */
  /** "b2b" = בחיוב לקוח, "regular" = ללא חיוב */
  route?: "b2b" | "regular";
  /** Worker link that holds this code */
  linkId?: string;
  clientCode?: string;
  accountName?: string;
  standard?: string;

  /* ---- Legacy vehicle link ---- */
  /** רישוי רכב */
  licensePlate?: string;
  /** שם נהג */
  driverName?: string;
  /** שם תקן */
  standardName?: string;
}

/** True for vouchers handed to an end worker (billing-relevant). */
/** True once the voucher was handed to an employee through a link. */
export const isIssued = (v: VoucherRecord) => Boolean(v.linkId || v.workerName || v.workerId);

/** Unused budget still available to hand out (not issued, redeemed or blocked). */
export const isAvailable = (v: VoucherRecord) =>
  !isIssued(v) && v.status !== "מומש סופית" && v.status !== "חסום";

export const isWorkerVoucher = (v: VoucherRecord) =>
  Boolean(v.workerId || v.workerName) || v.status === "הוקצה לעובד";

/** "מאגר ראשי" | "צפון" | "סניף צפון (מפקח דן)" */
export function formatAssignment(v: { branch: string; supervisor?: string }) {
  return v.supervisor ? `${v.branch} (${v.supervisor})` : v.branch;
}

export const vouchers: VoucherRecord[] = [];
