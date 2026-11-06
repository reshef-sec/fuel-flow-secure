import { isAvailable, type VoucherRecord } from "@/components/dashboard/voucherData";
import { isCentralBranch } from "./issuanceStock";
import type { FuelType } from "@/components/fuel/fuel";
import { STOCK_SHORTAGE } from "./issuanceInventory";

export const centralPoolOf = <T extends VoucherRecord>(list: T[], fuel?: FuelType) =>
  list.filter(v => isCentralBranch(v.branch) && !v.supervisor && isAvailable(v)
    && v.status === "טרם שומש" && (!fuel || (v.fuelType ?? "בנזין") === fuel));

export function centralFuelLimitError(split: Record<FuelType, number>, list: VoucherRecord[]): string | null {
  const pool = centralPoolOf(list);
  for (const fuel of ["בנזין", "סולר"] as const) {
    const total = pool.filter(v => (v.fuelType ?? "בנזין") === fuel).reduce((sum, v) => sum + v.amount, 0);
    if (!Number.isFinite(split[fuel]) || split[fuel] < 0) return "סכום לא תקין";
    if (split[fuel] > total) return STOCK_SHORTAGE;
  }
  return null;
}