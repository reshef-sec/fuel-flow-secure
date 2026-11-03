import { fuelLabel, fuelOf, type FuelType } from "@/components/fuel/fuel";
import type { VoucherRecord } from "@/components/dashboard/voucherData";
import type { B2BClientRecord, ClientRecord } from "@/store/appStore";
import { branchLabel } from "@/lib/branchLabels";
import { formatIsraelDate, inDateRange } from "@/lib/israelDate";
import { statusDisplay } from "@/lib/statusDisplay";

/** Report filters (dates are ISO YYYY-MM-DD bounds; branch is the display label; status is the stored value). */
export interface ReportFilterValues {
  from: string;
  to: string;
  branch: string;
  fuel: "" | FuelType;
  status: string;
}

export const emptyReportFilters: ReportFilterValues = { from: "", to: "", branch: "", fuel: "", status: "" };

/** Filter predicate shared by both reports (role scoping is applied separately, before this). */
export function matchesReportFilters(v: VoucherRecord, f: ReportFilterValues): boolean {
  if (!inDateRange(v.deliveredAt ?? v.updatedAt, f.from, f.to)) return false;
  if (f.branch && branchLabel(v.branch) !== f.branch) return false;
  if (f.fuel && fuelOf(v) !== f.fuel) return false;
  if (f.status && v.status !== f.status) return false;
  return true;
}

/** One-line description of the active filters for the Excel subtitle. */
export function describeFilters(f: ReportFilterValues, lockedBranch: string | null): string {
  const range = f.from || f.to
    ? `${f.from ? formatIsraelDate(f.from) : "…"} – ${f.to ? formatIsraelDate(f.to) : "…"}`
    : "כל התאריכים";
  const branch = lockedBranch ? branchLabel(lockedBranch) : f.branch || "כל הסניפים";
  const fuel = f.fuel ? fuelLabel(f.fuel) : "כל סוגי הדלק";
  const status = f.status ? statusDisplay(f.status).label : "כל הסטטוסים";
  return [range, branch, fuel, status].join(" · ");
}

/** Private-vehicle site of a voucher found in the pool and marked inactive (same matching as historicalClientName). */
export function isInactivePrivateClient(v: VoucherRecord, pool: ClientRecord[]): boolean {
  const hit = pool.find((c) => c.clientId === (v.clientId ?? v.clientCode) && c.siteId === v.siteId);
  return Boolean(hit && hit.isActive !== true);
}

/** Work-vehicle record of a voucher found in the pool and marked inactive (same matching as historicalClientName). */
export function isInactiveWorkClient(v: VoucherRecord, pool: B2BClientRecord[]): boolean {
  const hit = pool.find(
    (c) => c.clientCode === (v.clientCode ?? v.clientId) && (v.standard ? c.standard === v.standard : c.accountName === v.accountName),
  );
  return Boolean(hit && hit.isActive !== true);
}

export const deliveredDate = (v: VoucherRecord) => formatIsraelDate(v.deliveredAt ?? v.updatedAt);

export const fileStamp = () => new Date().toISOString().slice(0, 10);
