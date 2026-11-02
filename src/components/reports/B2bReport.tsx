import { FuelBadge } from "@/components/fuel/fuel";
import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { Pager, usePaged } from "@/components/ui/Pager";
import { downloadCsv, statusVariant } from "@/components/dashboard/statusVariant";
import type { VoucherStatus } from "@/components/dashboard/voucherData";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";
import { formatIsraelDate, inDateRange } from "@/lib/israelDate";
import { branchLabel } from "@/lib/branchLabels";
import { historicalClientName } from "@/lib/importIntegrity";

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
  const clients = useAppStore((s) => s.b2bClients);
  const branchList = useAppStore((s) => s.branchList);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();
  const myName = me ? fullName(me) : "";

  const rows = useMemo(() => {
    let list = vouchers.filter((v) => v.route === "b2b").map(v => ({ ...v, client: historicalClientName(v, [], clients) }));
    if (role === "branch" && me?.branch) list = list.filter((v) => v.branch === me.branch);
    if (role === "supervisor") list = list.filter((v) => v.supervisor === myName);
    if (filters) {
      const f = filters;
      list = list.filter((v) => {
        if (!inDateRange(v.deliveredAt ?? v.updatedAt, f.from, f.to)) return false;
        if (f.branch && branchLabel(v.branch) !== f.branch) return false;
        if (f.supervisor && v.supervisor !== f.supervisor) return false;
        if (f.client && v.client !== f.client) return false;
        if (f.status && v.status !== f.status) return false;
        return true;
      });
    }
    return list.map(v => ({ v, value: v.amount, code: v.serial }));
  }, [vouchers, clients, role, me?.branch, myName, filters]);

  const [view, setView] = useState<"detail" | "summary">("detail");
  const isAdmin = role === "admin";

  const detailHeaders = [
    "סניף", "ערך כרטיס", "סוג דלק", "מספר כרטיס", "שם לקוח", "קוד לקוח", "שם חשבון", "תקן",
    "שם עובד", "ת.ז", "טלפון", "תאריך מסירה", "סיבת הפקה", "סטטוס",
  ];
  const detail = rows.map(({ v, value, code }) => [
    branchLabel(v.branch), `${value} ₪`, v.fuelType ?? "בנזין", code, v.client ?? "—",
    v.clientCode ?? v.clientId ?? "—", v.accountName ?? v.siteName ?? "—", v.standard ?? v.standardName ?? "—",
    v.workerName ?? "—", v.workerId ?? "—", v.workerPhone ?? "—",
    formatIsraelDate(v.deliveredAt ?? v.updatedAt), v.reason ?? "—", v.status,
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
  const paged = usePaged(flat);
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
      <div className="mt-4 min-w-0 max-w-full md:overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              {headers.map((h) => (
                <TableHeaderCell key={h} className="whitespace-nowrap md:min-w-32">{h}</TableHeaderCell>
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
              paged.slice.map((cells, i) => (
                <TableRow key={i}>
                  {cells.map((c, j) => (
                    <TableCell key={j} className="whitespace-nowrap md:min-w-32">
                      {view === "detail" && j === 2 ? <FuelBadge fuel={c === "סולר" ? "סולר" : "בנזין"} /> : view === "detail" && j === 13 ? <Badge variant={statusVariant[c as VoucherStatus]} size="sm">{c}</Badge> : c}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pager {...paged} />
      </div>
    </section>
  );
}
