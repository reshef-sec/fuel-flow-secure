import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { downloadCsv, heDate } from "@/components/dashboard/statusVariant";
import type { VoucherRecord } from "@/components/dashboard/voucherData";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";

/** B2B billing report — one row per 100 ₪ code issued via the "ברכב עבודה" route. */
export interface ReportFilterValues {
  from: string;
  to: string;
  branch: string;
  supervisor: string;
  client: string;
  status: string;
}

export function B2bReport({ filters }: { filters?: ReportFilterValues }) {
  const vouchers = useAppStore((s) => s.vouchers);
  const branchList = useAppStore((s) => s.branchList);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();
  const myName = me ? fullName(me) : "";

  const rows = useMemo(() => {
    let list = vouchers.filter((v) => v.route === "b2b");
    if (role === "branch" && me?.branch) list = list.filter((v) => v.branch === me.branch);
    if (role === "supervisor") list = list.filter((v) => v.supervisor === myName);
    if (filters) {
      const f = filters;
      list = list.filter((v) => {
        if (f.from && v.updatedAt < f.from) return false;
        if (f.to && v.updatedAt > f.to) return false;
        if (f.branch && v.branch !== f.branch) return false;
        if (f.supervisor && v.supervisor !== f.supervisor) return false;
        if (f.client && v.client !== f.client) return false;
        if (f.status && v.status !== f.status) return false;
        return true;
      });
    }
    // Split multi-code vouchers into one row per 100 ₪ code.
    return list.flatMap((v) => {
      const n = Math.max(1, Math.round(v.amount / 100));
      if (n === 1) return [{ v, value: v.amount, code: v.serial }];
      return Array.from({ length: n }, (_, i) => ({ v, value: 100, code: `${v.serial}-${i + 1}` }));
    });
  }, [vouchers, role, me?.branch, myName, filters]);


  const detailHeaders = [
    "סניף", "ערך כרטיס", 'מס"ד כרטיס', ...(isAdmin ? ["סיריאלי"] : []), "שם לקוח", "קוד לקוח", "שם חשבון", "תקן",
    "שם עובד", "ת.ז", "טלפון", "תאריך מסירה", "סיבת הפקה",
  ];
  const detail = rows.map(({ v, value, code }) => [
    v.branch, `${value} ₪`, code, ...(isAdmin ? [v.realCode || "—"] : []), v.client ?? "—",
    v.clientCode ?? v.clientId ?? "—", v.accountName ?? v.siteName ?? "—", v.standard ?? v.standardName ?? "—",
    v.workerName ?? "—", v.workerId ?? "—", v.workerPhone ?? "—",
    heDate.format(new Date(v.deliveredAt ?? v.updatedAt)), v.reason ?? "—",
  ]);

  // One row per תקן for the filtered period.
  const summaryHeaders = ["תקן", "קוד לקוח", "שם לקוח", 'סה"כ ערך שוברים'];
  const summary = useMemo(() => {
    const m = new Map<string, { standard: string; codes: Set<string>; names: Set<string>; total: number }>();
    for (const { v, value } of rows) {
      const std = v.standard ?? v.standardName ?? "—";
      const g = m.get(std) ?? { standard: std, codes: new Set(), names: new Set(), total: 0 };
      g.codes.add(v.clientCode ?? v.clientId ?? "—");
      g.names.add(v.client ?? "—");
      g.total += value;
      m.set(std, g);
    }
    return [...m.values()].map((g) => [g.standard, [...g.codes].join(", "), [...g.names].join(", "), `${g.total.toLocaleString("he-IL")} ₪`]);
  }, [rows]);

  const headers = view === "detail" ? detailHeaders : summaryHeaders;
  const flat = view === "detail" ? detail : summary;
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold text-secondary">דוח רכב עבודה</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} כרטיסים · סה"כ {total.toLocaleString("he-IL")} ₪
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="תצוגת דוח" className="flex gap-1 rounded-lg bg-surface-muted p-1">
            {([["detail", "דוח מפורט"], ["summary", "דוח מסכם"]] as const).map(([k, label]) => (
              <button
                key={k}
                role="radio"
                aria-checked={view === k}
                onClick={() => setView(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-bold ${view === k ? "bg-surface text-primary shadow-card" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              downloadCsv(view === "detail" ? "work-vehicle-detailed.csv" : "work-vehicle-summary.csv", headers, flat);
              toast.success("הדוח יוצא לאקסל");
            }}
          >
            <FileDown className="size-4" />
            ייצוא לאקסל
          </Button>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              {headers.map((h) => (
                <TableHeaderCell key={h} className="whitespace-nowrap">{h}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {flat.length === 0 ? (
              <TableRow>
                <TableCell colSpan={headers.length} className="py-10 text-center text-muted-foreground">
                  אין שוברים שהופקו לרכב עבודה
                </TableCell>
              </TableRow>
            ) : (
              flat.map((cells, i) => (
                <TableRow key={i}>
                  {cells.map((c, j) => (
                    <TableCell key={j} className="whitespace-nowrap">
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
