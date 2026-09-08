export type VoucherStatus = "מומש סופית" | "טרם שומש" | "חסום" | "הוקצה לעובד";

export interface VoucherRecord {
  serial: string;
  amount: number;
  assignedTo: string;
  status: VoucherStatus;
  updatedAt: string;
}

export const vouchers: VoucherRecord[] = [
  { serial: "019949", amount: 150, assignedTo: "סניף צפון", status: "טרם שומש", updatedAt: "2026-08-31" },
  { serial: "271008", amount: 500, assignedTo: "מפקח דן", status: "מומש סופית", updatedAt: "2026-08-30" },
  { serial: "225902", amount: 100, assignedTo: "מאגר ראשי", status: "טרם שומש", updatedAt: "2026-08-30" },
  { serial: "225393", amount: 200, assignedTo: "סניף ירושלים", status: "חסום", updatedAt: "2026-08-29" },
  { serial: "012345", amount: 150, assignedTo: "סניף מרכז", status: "מומש סופית", updatedAt: "2026-08-28" },
  { serial: "104772", amount: 300, assignedTo: "מפקח אורי", status: "טרם שומש", updatedAt: "2026-08-27" },
  { serial: "556978", amount: 500, assignedTo: "מאגר ראשי", status: "טרם שומש", updatedAt: "2026-08-26" },
  { serial: "318508", amount: 100, assignedTo: "סניף דרום", status: "מומש סופית", updatedAt: "2026-08-25" },
  { serial: "224470", amount: 200, assignedTo: "סניף צפון", status: "חסום", updatedAt: "2026-08-24" },
  { serial: "889201", amount: 150, assignedTo: "מפקח דן", status: "מומש סופית", updatedAt: "2026-08-23" },
  { serial: "440318", amount: 500, assignedTo: "סניף חיפה", status: "טרם שומש", updatedAt: "2026-08-22" },
  { serial: "660112", amount: 100, assignedTo: "מאגר ראשי", status: "טרם שומש", updatedAt: "2026-08-21" },
  { serial: "773094", amount: 300, assignedTo: "סניף מרכז", status: "מומש סופית", updatedAt: "2026-08-20" },
  { serial: "915663", amount: 200, assignedTo: "מפקח אורי", status: "חסום", updatedAt: "2026-08-19" },
  { serial: "102938", amount: 150, assignedTo: "סניף ירושלים", status: "טרם שומש", updatedAt: "2026-08-18" },
  { serial: "483920", amount: 500, assignedTo: "סניף דרום", status: "מומש סופית", updatedAt: "2026-08-17" },
  { serial: "572011", amount: 100, assignedTo: "סניף חיפה", status: "טרם שומש", updatedAt: "2026-08-16" },
  { serial: "639874", amount: 200, assignedTo: "מאגר ראשי", status: "טרם שומש", updatedAt: "2026-08-15" },
];
