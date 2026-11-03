import { useMemo, useState } from "react";
import { FileDown, Search } from "lucide-react";
import { toast } from "sonner";

import { FuelBadge, fuelLabel, fuelOf, FUEL_TYPES, type FuelType } from "@/components/fuel/fuel";
import { DataTable, EmptyRow, KV, MobileCardList, TableCard } from "@/components/ui/DataTable";
import { FilterChips } from "@/components/ui/FilterChips";
import { Pager, usePaged } from "@/components/ui/Pager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CARD_STATUS_FILTERS, statusDisplay } from "@/lib/statusDisplay";
import { downloadReport } from "@/lib/excel";
import { formatAssignment, type VoucherRecord } from "./voucherData";
import { heDate } from "./statusVariant";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";

type StatusFilter = "all" | (typeof CARD_STATUS_FILTERS)[number];
type FuelFilter = "all" | FuelType;

const PAGE_SIZES = [10, 25, 50] as const;
const fieldClass =
  "h-11 rounded-control border border-line-strong bg-surface px-3 text-[15px] text-navy-900 outline-none focus:shadow-focus-mint";

/** Display group of a stored status (legacy "מומש בפועל" counts as מומש סופית). */
const groupOf = (status: string) => statusDisplay(status).label;
const dateOrDash = (v?: string) => (v ? heDate.format(new Date(v)) : "—");
const vehicleOrSite = (v: VoucherRecord) =>
  v.licensePlate || [v.siteId, v.siteName].filter(Boolean).join(" · ") || v.accountName || "—";

/**
 * Voucher inventory table (page "מלאי שוברים"). Role scoping is unchanged: branch managers see only
 * their branch, supervisors only vouchers assigned to them; everyone else sees the full store list.
 */
export function VoucherTable({
  since = null,
  periodLabel,
}: {
  /** ISO date; only vouchers updated on/after it are shown. null = all time. */
  since?: string | null;
  periodLabel?: string;
} = {}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [fuel, setFuel] = useState<FuelFilter>("all");
  const [size, setSize] = useState<number>(50);
  const allVouchers = useAppStore((s) => s.vouchers);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();

  // Branch managers see only their own branch; supervisors only vouchers assigned to them.
  const myName = me ? fullName(me) : "";
  const vouchers = useMemo(() => {
    let rows = allVouchers;
    if (role === "branch" && me?.branch) rows = rows.filter((v) => v.branch === me.branch);
    else if (role === "supervisor") rows = rows.filter((v) => v.supervisor === myName);
    if (since) rows = rows.filter((v) => v.updatedAt >= since);
    return rows;
  }, [allVouchers, role, me?.branch, myName, since]);

  // Search + fuel filter first, so the status chip counts reflect them.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (fuel !== "all" && fuelOf(v) !== fuel) return false;
      if (!q) return true;
      return (
        v.serial.toLowerCase().includes(q) ||
        formatAssignment(v).toLowerCase().includes(q) ||
        (v.workerName ?? "").toLowerCase().includes(q)
      );
    });
  }, [vouchers, search, fuel]);

  const rows = useMemo(
    () => (status === "all" ? searched : searched.filter((v) => groupOf(v.status) === groupOf(status))),
    [searched, status],
  );
  const paged = usePaged(rows, size);

  const chips = [
    { value: "all" as StatusFilter, label: "הכל", count: searched.length },
    ...CARD_STATUS_FILTERS.map((s) => ({
      value: s as StatusFilter,
      label: statusDisplay(s).label,
      count: searched.filter((v) => groupOf(v.status) === groupOf(s)).length,
    })),
  ];

  function exportExcel() {
    void downloadReport<VoucherRecord>({
      fileName: "vouchers.xlsx",
      title: "מלאי שוברים",
      subtitle: [periodLabel, status === "all" ? "כל הסטטוסים" : statusDisplay(status).label, fuel === "all" ? "כל סוגי הדלק" : fuelLabel(fuel)]
        .filter(Boolean)
        .join(" · "),
      generatedBy: myName || undefined,
      sheetName: "שוברים",
      columns: [
        { header: "מספר כרטיס", key: "serial", type: "text" },
        { header: "סכום", key: "amount", type: "money" },
        { header: "סוג דלק", key: "fuelType", type: "text", get: (v) => v.fuelType ?? "בנזין" },
        { header: "שויך ל", key: "assignedTo", type: "text", get: (v) => formatAssignment(v) },
        { header: "סטטוס", key: "status", type: "text", get: (v) => statusDisplay(v.status).label },
        { header: "תאריך עדכון", key: "updatedAt", type: "date" },
      ],
      rows,
      totals: true,
    })
      .then(() => toast.success("הייצוא לאקסל הושלם בהצלחה"))
      .catch(() => toast.error("הייצוא לאקסל נכשל"));
  }

  const toolbar = (
    <>
      <FilterChips label="סינון לפי סטטוס" items={chips} value={status} onChange={setStatus} />
      <div className="flex w-full flex-wrap items-center gap-2.5 min-[900px]:w-auto">
        <label className="relative block w-full min-[900px]:w-60">
          <span className="sr-only">חיפוש בטבלה</span>
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-slate-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="מספר כרטיס, שיוך או שם עובד"
            className={`${fieldClass} w-full ps-9`}
          />
        </label>
        <label className="flex w-full items-center gap-2 text-[13.5px] text-slate-600 min-[900px]:w-auto">
          <span className="whitespace-nowrap">סוג דלק</span>
          <select value={fuel} onChange={(e) => setFuel(e.target.value as FuelFilter)} className={`${fieldClass} flex-1`}>
            <option value="all">הכל</option>
            {FUEL_TYPES.map((f) => (
              <option key={f} value={f}>{fuelLabel(f)}</option>
            ))}
          </select>
        </label>
        <button type="button" className="ds-btn ds-btn-light w-full min-[900px]:w-auto" onClick={exportExcel}>
          <FileDown className="size-4" aria-hidden />
          ייצוא לאקסל
        </button>
      </div>
    </>
  );

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-[13.5px] text-slate-600">
        שורות בעמוד
        <select value={size} onChange={(e) => setSize(Number(e.target.value))} className={`${fieldClass} h-10`}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="min-w-0 flex-1 [&>div]:mt-0">
        <Pager {...paged} size={size} always />
      </div>
    </div>
  );

  return (
    <TableCard label="טבלת שוברים" toolbar={toolbar} footer={footer}>
      <DataTable minWidth={1180} maxHeight={470} caption="טבלת שוברים">
        <thead>
          <tr>
            <th scope="col">מספר כרטיס</th>
            <th scope="col">סוג דלק</th>
            <th scope="col">ערך</th>
            <th scope="col">סטטוס</th>
            <th scope="col">שויך ל</th>
            <th scope="col">עובד</th>
            <th scope="col">רכב / אתר</th>
            <th scope="col">תאריך עדכון</th>
            <th scope="col">תוקף</th>
          </tr>
        </thead>
        <tbody>
          {paged.slice.length === 0 ? (
            <EmptyRow colSpan={9}>לא נמצאו שוברים מתאימים</EmptyRow>
          ) : (
            paged.slice.map((v) => (
              <tr key={v.serial}>
                <td><span className="ds-num font-semibold text-navy-700">{v.serial}</span></td>
                <td><FuelBadge fuel={v.fuelType} /></td>
                <td><span className="ds-num font-semibold">{v.amount.toLocaleString("he-IL")} ₪</span></td>
                <td><StatusBadge status={v.status} size="sm" /></td>
                <td>{formatAssignment(v)}</td>
                <td className="text-ink-soft">{v.workerName || "—"}</td>
                <td className="text-slate-600">{vehicleOrSite(v)}</td>
                <td><span className="ds-num text-ink-soft">{dateOrDash(v.updatedAt)}</span></td>
                <td><span className="ds-num text-ink-soft">{dateOrDash(v.expiresAt)}</span></td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      <MobileCardList
        items={paged.slice}
        keyOf={(v) => v.serial}
        empty="לא נמצאו שוברים מתאימים"
        render={(v) => (
          <>
            <div className="flex items-center justify-between gap-2.5">
              <span className="ds-num text-[15px] font-semibold text-navy-700">{v.serial}</span>
              <StatusBadge status={v.status} size="sm" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FuelBadge fuel={v.fuelType} />
              <span className="ds-num text-[17px] font-bold">{v.amount.toLocaleString("he-IL")} ₪</span>
            </div>
            <KV label="שויך ל">{formatAssignment(v)}</KV>
            {v.workerName ? <KV label="עובד">{v.workerName}</KV> : null}
            <KV label="עדכון → תוקף">
              <span className="ds-num">{dateOrDash(v.updatedAt)} → {dateOrDash(v.expiresAt)}</span>
            </KV>
          </>
        )}
      />
    </TableCard>
  );
}
