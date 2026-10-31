import { FuelBadge } from "@/components/fuel/fuel";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown, Filter, Fuel, Printer, RotateCcw, Table2 } from "lucide-react";
import { toast } from "sonner";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { Tabs } from "@/components/ui/Tabs";
import { Pager, usePaged } from "@/components/ui/Pager";
import { B2bReport } from "@/components/reports/B2bReport";
import { IsraelDateInput } from "@/components/ui/IsraelDateInput";
import { formatIsraelDate, inDateRange } from "@/lib/israelDate";
import { branchLabel, branchOptions } from "@/lib/branchLabels";
import { MAIN_POOL } from "@/components/dashboard/voucherData";
import { historicalClientName } from "@/lib/importIntegrity";
import {
  Badge,
  Button,
  Card,
  FormField,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { downloadCsv, statusVariant } from "@/components/dashboard/statusVariant";
import { formatAssignment, type VoucherStatus } from "@/components/dashboard/voucherData";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "דוחות | רשף ביטחון" },
      {
        name: "description",
        content: "דוח רכב פרטי ודוח רכב עבודה על שוברי הדלק עם סינון לפי תאריך, סניף, מפקח, לקוח וסטטוס וייצוא לאקסל ו-PDF.",
      },
      { property: "og:title", content: "דוחות | רשף ביטחון" },
      { property: "og:description", content: "דוחות שוברים עם סינון מתקדם וייצוא לאקסל ו-PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const statuses: VoucherStatus[] = ["טרם שומש", "הוקצה לעובד", "מומש בפועל", "מומש סופית", "חסום"];
const empty = { from: "", to: "", branch: "", supervisor: "", client: "", status: "" };

const reportTabs = [
  { id: "master", label: "דוח רכב פרטי", icon: Table2 },
  { id: "paz", label: 'דוח רכב עבודה', icon: Fuel },
] as const;

function ReportsPage() {
  const [tab, setTab] = useState<string>("master");
  const vouchers = useAppStore((s) => s.vouchers);
  const branchList = useAppStore((s) => s.branchList);
  const users = useAppStore((s) => s.users);
  const clients = useAppStore((s) => s.nonB2bClients);
  const b2bClients = useAppStore((s) => s.b2bClients);
  const reportVouchers = useMemo(() => vouchers.map(v => ({ ...v, client: historicalClientName(v, clients, b2bClients) })), [vouchers, clients, b2bClients]);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();
  const [filters, setFilters] = useState(empty);
  const branches = branchOptions([MAIN_POOL, ...branchList.map(b => b.name)]);

  // Branch managers are locked to their own branch — no "all branches" option.
  const lockedBranch = role === "admin" ? null : (me?.branch ?? "");
  // Supervisors are locked to vouchers assigned to them personally.
  const lockedSupervisor = role === "supervisor" ? (me ? fullName(me) : "") : null;

  const supervisors = useMemo(
    () =>
      users
        .filter((u) => u.role === "supervisor" && (!lockedBranch || u.branch === lockedBranch))
        .map((u) => fullName(u)),
    [users, lockedBranch],
  );
  const clientOptions = useMemo(() => {
    const fromVouchers = reportVouchers.map((v) => v.client).filter(Boolean) as string[];
    const fromSettings = clients.map((c) => c.clientName);
    return Array.from(new Set([...fromVouchers, ...fromSettings]));
  }, [reportVouchers, clients]);

  const rows = useMemo(
    () =>
      reportVouchers.filter((v) => {
        if (v.route === "b2b") return false;
        if (lockedBranch && v.branch !== lockedBranch) return false;
        if (lockedSupervisor !== null && v.supervisor !== lockedSupervisor) return false;
        if (!inDateRange(v.deliveredAt ?? v.updatedAt, filters.from, filters.to)) return false;
        if (filters.branch && branchLabel(v.branch) !== filters.branch) return false;
        if (filters.supervisor && v.supervisor !== filters.supervisor) return false;
        if (filters.client && v.client !== filters.client) return false;
        if (filters.status && v.status !== filters.status) return false;
        return true;
      }),
    [reportVouchers, filters, lockedBranch, lockedSupervisor],
  );

  const paged = usePaged(rows);
  const total = rows.reduce((sum, v) => sum + v.amount, 0);
  const isAdmin = role === "admin";
  // Redemption codes are never shown in staff reports.
  const headers = [
    "מספר כרטיס",
    "סכום",
    "סוג דלק",
    "שויך ל",
    "לקוח",
    "שם עובד",
    "ת.ז",
    "טלפון",
    "סיבת הפקה",
    "סטטוס",
    "תאריך מסירה",
  ];
  const cells = rows.map((v) => [
    v.serial,
    `${v.amount.toLocaleString("he-IL")} ₪`,
    v.fuelType ?? "בנזין",
    formatAssignment(v),
    v.client ?? "—",
    v.workerName ?? "—",
    v.workerId ?? "—",
    v.workerPhone ?? "—",
    v.reason ?? "—",
    v.status,
    formatIsraelDate(v.deliveredAt ?? v.updatedAt),
  ]);
  const statusCol = headers.indexOf("סטטוס");
  const fuelCol = headers.indexOf("סוג דלק");

  function exportExcel() {
    downloadCsv("non-billing-report.csv", headers, cells);
    toast.success("הדוח יוצא לאקסל בהצלחה");
  }

  function exportPdf() {
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("החסימה של חלונות קופצים מנעה את הפקת ה-PDF");
      return;
    }
    const head = headers.map((h) => `<th>${h}</th>`).join("");
    const body = cells
      .map((r) => `<tr>${r.map((c) => `<td>${String(c)}</td>`).join("")}</tr>`)
      .join("");
    win.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<title>דוח רכב פרטי</title><style>
body{font-family:Assistant,Arial,sans-serif;padding:24px;color:#0f2445}
h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
th,td{border:1px solid #cbd5e1;padding:6px;text-align:right}th{background:#e8f0fb}
</style></head><body><h1>דוח רכב פרטי · רשף ביטחון</h1>
<p>${rows.length} רשומות · סה"כ ${total.toLocaleString("he-IL")} ₪</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
    toast.success("הדוח נשלח להפקת PDF");
  }

  return (
    <InternalLayout title="דוחות">
      <Tabs items={reportTabs} value={tab} onChange={setTab} />

      <Card padding="lg" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-secondary">
            <Filter className="size-5 text-primary" />
            סינון הדוח
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setFilters(empty)}>
            <RotateCcw className="size-4" />
            איפוס סינון
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <FormField label="מתאריך">
            <IsraelDateInput value={filters.from} onChange={from => setFilters({ ...filters, from })} label="מתאריך" />
          </FormField>
          <FormField label="עד תאריך">
            <IsraelDateInput value={filters.to} onChange={to => setFilters({ ...filters, to })} label="עד תאריך" />
          </FormField>
          <FormField label="סניף">
            {lockedBranch !== null ? (
              <Select value={lockedBranch} onChange={() => {}} aria-label="סניף" disabled>
                <option value={lockedBranch}>{lockedBranch ? branchLabel(lockedBranch) : "—"}</option>
              </Select>
            ) : (
              <Select
                value={filters.branch}
                onChange={(e) => setFilters({ ...filters, branch: e.target.value })}
                aria-label="סניף"
              >
                <option value="">כל הסניפים</option>
                {branches.map((b) => (
                  <option key={b.label} value={b.label}>
                    {b.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="מפקח">
            {lockedSupervisor !== null ? (
              <Select value={lockedSupervisor} onChange={() => {}} aria-label="מפקח" disabled>
                <option value={lockedSupervisor}>{lockedSupervisor || "—"}</option>
              </Select>
            ) : (
              <Select
                value={filters.supervisor}
                onChange={(e) => setFilters({ ...filters, supervisor: e.target.value })}
                aria-label="מפקח"
              >
                <option value="">כל המפקחים</option>
                {supervisors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="לקוח">
            <Select
              value={filters.client}
              onChange={(e) => setFilters({ ...filters, client: e.target.value })}
              aria-label="לקוח"
            >
              <option value="">כל הלקוחות</option>
              {clientOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="סטטוס">
            <Select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              aria-label="סטטוס"
            >
              <option value="">כל הסטטוסים</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Card>

      {tab === "paz" ? (
        <div className="mt-8">
          <B2bReport filters={filters} />
        </div>
      ) : (
        <>
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold text-secondary">דוח רכב פרטי</h2>
            <p className="text-sm tabular-nums text-muted-foreground">
              {rows.length} רשומות · סה"כ {total.toLocaleString("he-IL")} ₪
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportExcel}>
              <FileDown className="size-4" />
              ייצוא לאקסל
            </Button>
            <Button onClick={exportPdf}>
              <Printer className="size-4" />
              ייצוא ל-PDF
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
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={headers.length} className="py-10 text-center text-muted-foreground">
                    לא נמצאו רשומות מתאימות לסינון
                  </TableCell>
                </TableRow>
              ) : (
                paged.slice.map((v, i) => (
                  <TableRow key={v.serial}>
                    {cells[paged.offset + i]?.map((c, j) => (
                      <TableCell key={j} className="whitespace-nowrap md:min-w-32">
                        {j === statusCol ? (
                          <Badge variant={statusVariant[v.status]} size="md">{v.status}</Badge>
                        ) : j === fuelCol ? (
                          <FuelBadge fuel={v.fuelType} />
                        ) : (
                          c
                        )}
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
        </>
      )}
    </InternalLayout>
  );
}
