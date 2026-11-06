import { useMemo } from "react";

import { FuelBadge, fuelOf } from "@/components/fuel/fuel";
import { DataTable, EmptyRow, KV, MobileCardList } from "@/components/ui/DataTable";
import { Pager, usePaged } from "@/components/ui/Pager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatAssignment, type VoucherRecord } from "@/components/dashboard/voucherData";
import { historicalClientName } from "@/lib/importIntegrity";
import { downloadReport, type ReportColumn } from "@/lib/excel";
import { statusDisplay } from "@/lib/statusDisplay";
import { useAppStore } from "@/store/appStore";
import {
  deliveredDate,
  describeFilters,
  fileStamp,
  isInactivePrivateClient,
  matchesReportFilters,
  type ReportFilterValues,
} from "./reportData";
import { InactiveClientTag, ReportCard } from "./ReportCard";

type Row = VoucherRecord & { inactive: boolean };

/** Same columns on screen and in Excel. Redemption codes are never shown in staff reports. */
const columns: ReportColumn<Row>[] = [
  { header: "מספר כרטיס", key: "serial", type: "text" },
  { header: "סכום", key: "amount", type: "money" },
  { header: "סוג דלק", key: "fuel", type: "text", get: (v) => fuelOf(v) },
  { header: "שויך ל", key: "assigned", type: "text", get: (v) => formatAssignment(v) },
  { header: "לקוח", key: "client", type: "text", get: (v) => v.client ?? "—" },
  { header: "שם עובד", key: "workerName", type: "text", get: (v) => v.workerName ?? "—" },
  { header: "טלפון", key: "workerPhone", type: "text", get: (v) => v.workerPhone ?? "—" },
  { header: "סיבת הפקה", key: "reason", type: "text", get: (v) => v.reason ?? "—" },
  { header: "סטטוס", key: "status", type: "text", get: (v) => statusDisplay(v.status).label },
  { header: "תאריך מסירה", key: "delivered", type: "date", get: (v) => deliveredDate(v) },
];

export function PrivateReport({
  filters,
  lockedBranch,
  lockedSupervisor,
  generatedBy,
}: {
  filters: ReportFilterValues;
  /** Branch managers are locked to their own branch (null = sees all). */
  lockedBranch: string | null;
  /** Supervisors are locked to vouchers assigned to them personally (null = not locked). */
  lockedSupervisor: string | null;
  generatedBy: string;
}) {
  const vouchers = useAppStore((s) => s.vouchers);
  const clients = useAppStore((s) => s.nonB2bClients);
  const b2bClients = useAppStore((s) => s.b2bClients);

  const rows = useMemo<Row[]>(
    () =>
      vouchers
        .filter((v) => {
          if (v.route === "b2b") return false;
          if (lockedBranch && v.branch !== lockedBranch) return false;
          if (lockedSupervisor !== null && v.supervisor !== lockedSupervisor) return false;
          return matchesReportFilters(v, filters);
        })
        .map((v) => ({ ...v, client: historicalClientName(v, clients, b2bClients), inactive: isInactivePrivateClient(v, clients) })),
    [vouchers, clients, b2bClients, filters, lockedBranch, lockedSupervisor],
  );

  const paged = usePaged(rows);
  const total = rows.reduce((sum, v) => sum + v.amount, 0);

  const exportExcel = () =>
    downloadReport<Row>({
      fileName: `דוח-רכב-פרטי-${fileStamp()}.xlsx`,
      title: "דוח רכב פרטי",
      subtitle: describeFilters(filters, lockedBranch),
      generatedBy,
      columns,
      rows,
      totals: true,
      sheetName: "רכב פרטי",
    });

  return (
    <ReportCard
      title="דוח רכב פרטי"
      count={rows.length}
      countUnit="רשומות"
      sum={total}
      onExport={exportExcel}
      footer={<Pager {...paged} always />}
    >
      <DataTable minWidth={1400} caption="דוח רכב פרטי">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={columns.length}>לא נמצאו רשומות מתאימות לסינון</EmptyRow>
          ) : (
            paged.slice.map((v) => (
              <tr key={v.serial}>
                <td><span className="ds-num font-semibold">{v.serial}</span></td>
                <td><span className="ds-num">{v.amount.toLocaleString("he-IL")} ₪</span></td>
                <td><FuelBadge fuel={v.fuelType} /></td>
                <td>{formatAssignment(v)}</td>
                <td>{v.client ?? "—"}{v.inactive ? <InactiveClientTag /> : null}</td>
                <td>{v.workerName ?? "—"}</td>
                <td><span className="ds-num" dir="ltr">{v.workerPhone ?? "—"}</span></td>
                <td>{v.reason ?? "—"}</td>
                <td><StatusBadge status={v.status} size="sm" /></td>
                <td><span className="ds-num">{deliveredDate(v)}</span></td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      <MobileCardList
        items={paged.slice}
        keyOf={(v) => v.serial}
        empty="לא נמצאו רשומות מתאימות לסינון"
        render={(v) => (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="ds-num font-bold text-navy-900">{v.serial}</span>
              <StatusBadge status={v.status} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <FuelBadge fuel={v.fuelType} />
              <span className="ds-num font-bold text-navy-900">{v.amount.toLocaleString("he-IL")} ₪</span>
            </div>
            <KV label="לקוח">{v.client ?? "—"}{v.inactive ? <InactiveClientTag /> : null}</KV>
            <KV label="שם עובד">{v.workerName ?? "—"}</KV>
            <KV label="תאריך מסירה"><span className="ds-num">{deliveredDate(v)}</span></KV>
          </>
        )}
      />
    </ReportCard>
  );
}
