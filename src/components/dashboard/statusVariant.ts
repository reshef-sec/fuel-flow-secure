import type { VoucherStatus } from "./voucherData";
import { formatIsraelDate } from "@/lib/israelDate";

/**
 * Badge colour per stored card status (redesign 2026): available green, issued orange,
 * redeemed red; legacy "חסום" renders neutral grey. For the display LABEL ("טרם שומש" → "זמין")
 * use <StatusBadge> from "@/components/ui/StatusBadge" or statusDisplay() from "@/lib/statusDisplay".
 */
export const statusVariant: Record<VoucherStatus, "available" | "issued" | "redeemed" | "muted"> = {
  "מומש סופית": "redeemed",
  "מומש בפועל": "redeemed",
  "טרם שומש": "available",
  "הוקצה לעובד": "issued",
  חסום: "muted",
};

export const heDate = { format: (value: Date) => formatIsraelDate(value) };

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
