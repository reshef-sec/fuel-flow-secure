import { useMemo, useState } from "react";

import { FuelBadge, fuelOf } from "@/components/fuel/fuel";
import { DataTable, EmptyRow, KV, MobileCardList } from "@/components/ui/DataTable";
import { Pager, usePaged } from "@/components/ui/Pager";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import type { VoucherRecord } from "@/components/dashboard/voucherData";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";
import { branchLabel } from "@/lib/branchLabels";
import { historicalClientName } from "@/lib/importIntegrity";
import { downloadReport, type ReportColumn } from "@/lib/excel";
import { statusDisplay } from "@/lib/statusDisplay";
import {
  deliveredDate,
  describeFilters,
  fileStamp,
  isInactiveWorkClient,
  matchesReportFilters,
  type ReportFilterValues,
} from "./reportData";
import { InactiveClientTag, ReportCard } from "./ReportCard";

export type { ReportFilterValues } from "./reportData";

/** B2B billing report — one row per card issued via the "רכב עבודה" route. */
type DetailRow = VoucherRecord & { value: number; code: string; inactive: boolean };
interface SummaryRow {
  standard: string;
  codes: string;
  names: string;
  total: number;
  inactive: boolean;
}

const detailColumns: ReportColumn<DetailRow>[] = [
  { header: "סניף", key: "branch", type: "text", get: (v) => branchLabel(v.branch) },
  { header: "ערך כרטיס", key: "value", type: "money" },
  { header: "סוג דלק", key: "fuel", type: "text", get: (v) => fuelOf(v) },
  { header: "מספר כרטיס", key: "code", type: "text" },
  { header: "שם לקוח", key: "client", type: "text", get: (v) => v.client ?? "—" },
  { header: "קוד לקוח", key: "clientCode", type: "text", get: (v) => v.clientCode ?? v.clientId ?? "—" },
  { header: "שם חשבון", key: "accountName", type: "text", get: (v) => v.accountName ?? v.siteName ?? "—" },
  { header: "תקן", key: "standard", type: "text", get: (v) => v.standard ?? v.standardName ?? "—" },
  { header: "שם עובד", key: "workerName", type: "text", get: (v) => v.workerName ?? "—" },
  { header: "ת.ז", key: "workerId", type: "text", get: (v) => v.workerId ?? "—" },
  { header: "טלפון", key: "workerPhone", type: "text", get: (v) => v.workerPhone ?? "—" },
  { header: "תאריך מסירה", key: "delivered", type: "date", get: (v) => deliveredDate(v) },
  { header: "סיבת הפקה", key: "reason", type: "text", get: (v) => v.reason ?? "—" },
  { header: "סטטוס", key: "status", type: "text", get: (v) => statusDisplay(v.status).label },
];

// One row per תקן for the filtered period.
const summaryColumns: ReportColumn<SummaryRow>[] = [
  { header: "תקן", key: "standard", type: "text" },
  { header: "קוד לקוח", key: "codes", type: "text" },
  { header: "שם לקוח", key: "names", type: "text" },
  { header: 'סה"כ ערך שוברים', key: "total", type: "money" },
];

export function B2bReport({ filters, generatedBy }: { filters: ReportFilterValues; generatedBy?: string }) {
  const vouchers = useAppStore((s) => s.vouchers);
  const clients = useAppStore((s) => s.b2bClients);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();
  const myName = me ? fullName(me) : "";

  const rows = useMemo<DetailRow[]>(() => {
    let list = vouchers.filter((v) => v.route === "b2b").map(v => ({ ...v, client: historicalClientName(v, [], clients) }));
    if (role === "branch" && me?.branch) list = list.filter((v) => v.branch === me.branch);
    if (role === "supervisor") list = list.filter((v) => v.supervisor === myName);
    list = list.filter((v) => matchesReportFilters(v, filters));
    return list.map(v => ({ ...v, value: v.amount, code: v.serial, inactive: isInactiveWorkClient(v, clients) }));
  }, [vouchers, clients, role, me?.branch, myName, filters]);

  const [view, setView] = useState<"detail" | "summary">("detail");

  const summary = useMemo<SummaryRow[]>(() => {
    const m = new Map<string, { standard: string; codes: Set<string>; names: Set<string>; total: number; flags: boolean[] }>();
    for (const v of rows) {
      const std = v.standard ?? v.standardName ?? "—";
      const g = m.get(std) ?? { standard: std, codes: new Set(), names: new Set(), total: 0, flags: [] };
      g.codes.add(v.clientCode ?? v.clientId ?? "—");
      g.names.add(v.client ?? "—");
      g.total += v.value;
      g.flags.push(v.inactive);
      m.set(std, g);
    }
    return [...m.values()].map((g) => ({
      standard: g.standard,
      codes: [...g.codes].join(", "),
      names: [...g.names].join(", "),
      total: g.total,
      inactive: g.flags.length > 0 && g.flags.every(Boolean),
    }));
  }, [rows]);

  const detailPaged = usePaged(rows);
  const summaryPaged = usePaged(summary);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const lockedBranch = role === "branch" && me?.branch ? me.branch : null;

  const exportExcel = () =>
    view === "detail"
      ? downloadReport<DetailRow>({
          fileName: `דוח-רכב-עבודה-מפורט-${fileStamp()}.xlsx`,
          title: "דוח רכב עבודה — מפורט",
          subtitle: describeFilters(filters, lockedBranch),
          generatedBy,
          columns: detailColumns,
          rows,
          totals: true,
          sheetName: "רכב עבודה מפורט",
        })
      : downloadReport<SummaryRow>({
          fileName: `דוח-רכב-עבודה-מסכם-${fileStamp()}.xlsx`,
          title: "דוח רכב עבודה — מסכם",
          subtitle: describeFilters(filters, lockedBranch),
          generatedBy,
          columns: summaryColumns,
          rows: summary,
          totals: true,
          sheetName: "רכב עבודה מסכם",
        });

  const switcher = (
    <Tabs
      label="תצוגת דוח רכב עבודה"
      items={[{ id: "detail", label: "מפורט" }, { id: "summary", label: "מסכם" }]}
      value={view}
      onChange={(id) => setView(id === "summary" ? "summary" : "detail")}
    />
  );

  return (
    <ReportCard
      title="דוח רכב עבודה"
      count={rows.length}
      countUnit="כרטיסים"
      sum={total}
      switcher={switcher}
      onExport={exportExcel}
      footer={view === "detail" ? <Pager {...detailPaged} always /> : <Pager {...summaryPaged} always />}
    >
      {view === "detail" ? (
        <>
          <DataTable minWidth={1650} caption="דוח רכב עבודה מפורט">
            <thead>
              <tr>{detailColumns.map((c) => <th key={c.key} scope="col">{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={detailColumns.length}>אין שוברים שהופקו לרכב עבודה</EmptyRow>
              ) : (
                detailPaged.slice.map((v) => (
                  <tr key={v.serial}>
                    <td className="font-semibold">{branchLabel(v.branch)}</td>
                    <td><span className="ds-num">{v.value} ₪</span></td>
                    <td><FuelBadge fuel={v.fuelType} /></td>
                    <td><span className="ds-num">{v.code}</span></td>
                    <td>{v.client ?? "—"}{v.inactive ? <InactiveClientTag /> : null}</td>
                    <td><span className="ds-num">{v.clientCode ?? v.clientId ?? "—"}</span></td>
                    <td>{v.accountName ?? v.siteName ?? "—"}</td>
                    <td><span className="ds-num">{v.standard ?? v.standardName ?? "—"}</span></td>
                    <td>{v.workerName ?? "—"}</td>
                    <td><span className="ds-num">{v.workerId ?? "—"}</span></td>
                    <td><span className="ds-num" dir="ltr">{v.workerPhone ?? "—"}</span></td>
                    <td><span className="ds-num">{deliveredDate(v)}</span></td>
                    <td>{v.reason ?? "—"}</td>
                    <td><StatusBadge status={v.status} size="sm" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
          <MobileCardList
            items={detailPaged.slice}
            keyOf={(v) => v.serial}
            empty="אין שוברים שהופקו לרכב עבודה"
            render={(v) => (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="ds-num font-bold text-navy-900">{v.code}</span>
                  <StatusBadge status={v.status} size="sm" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <FuelBadge fuel={v.fuelType} />
                  <span className="ds-num font-bold text-navy-900">{v.value} ₪</span>
                </div>
                <KV label="שם לקוח">{v.client ?? "—"}{v.inactive ? <InactiveClientTag /> : null}</KV>
                <KV label="תקן · סניף"><span className="ds-num">{v.standard ?? v.standardName ?? "—"}</span> · {branchLabel(v.branch)}</KV>
                <KV label="שם עובד">{v.workerName ?? "—"}</KV>
              </>
            )}
          />
        </>
      ) : (
        <>
          <DataTable minWidth={640} caption="דוח רכב עבודה מסכם">
            <thead>
              <tr>{summaryColumns.map((c) => <th key={c.key} scope="col">{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {summary.length === 0 ? (
                <EmptyRow colSpan={summaryColumns.length}>אין שוברים שהופקו לרכב עבודה</EmptyRow>
              ) : (
                summaryPaged.slice.map((g) => (
                  <tr key={g.standard}>
                    <td><span className="ds-num font-semibold">{g.standard}</span></td>
                    <td><span className="ds-num">{g.codes}</span></td>
                    <td>{g.names}{g.inactive ? <InactiveClientTag /> : null}</td>
                    <td><span className="ds-num font-bold">{g.total.toLocaleString("he-IL")} ₪</span></td>
                  </tr>
                ))
              )}
            </tbody>
            {summary.length > 0 ? (
              <tfoot>
                <tr>
                  <td>סה״כ</td>
                  <td />
                  <td />
                  <td><span className="ds-num">{total.toLocaleString("he-IL")} ₪</span></td>
                </tr>
              </tfoot>
            ) : null}
          </DataTable>
          <MobileCardList
            items={summaryPaged.slice}
            keyOf={(g) => g.standard}
            empty="אין שוברים שהופקו לרכב עבודה"
            render={(g) => (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="ds-num font-bold text-navy-900">{g.standard}</span>
                  <span className="ds-num font-bold text-navy-900">{g.total.toLocaleString("he-IL")} ₪</span>
                </div>
                <KV label="שם לקוח">{g.names}{g.inactive ? <InactiveClientTag /> : null}</KV>
                <KV label="קוד לקוח"><span className="ds-num">{g.codes}</span></KV>
              </>
            )}
          />
        </>
      )}
    </ReportCard>
  );
}
