import type { VoucherStatus } from "./voucherData";
import { formatIsraelDate } from "@/lib/israelDate";

export const statusVariant: Record<VoucherStatus, "success" | "info" | "danger" | "purple"> = {
  "מומש סופית": "success",
  "מומש בפועל": "success",
  "טרם שומש": "info",
  "הוקצה לעובד": "purple",
  חסום: "danger",
};

export const heDate = { format: (value: Date) => formatIsraelDate(value) };

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
