import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown, Filter, Fuel, Printer, RotateCcw, Table2 } from "lucide-react";
import { toast } from "sonner";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { Tabs } from "@/components/ui/Tabs";
import { PazReport } from "@/components/reports/PazReport";
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { downloadCsv, heDate, statusVariant } from "@/components/dashboard/statusVariant";
import { formatAssignment, type VoucherStatus } from "@/components/dashboard/voucherData";
import { fullName, useAppStore } from "@/store/appStore";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "דוחות | רשף ביטחון" },
      {
        name: "description",
        content: "דוח מאסטר על שוברי הדלק עם סינון לפי תאריך, סניף, מפקח, לקוח וסטטוס וייצוא לאקסל ו-PDF.",
      },
      { property: "og:title", content: "דוחות | רשף ביטחון" },
      { property: "og:description", content: "דוח מאסטר עם סינון מתקדם וייצוא לאקסל ו-PDF." },
    ],
  }),
  component: ReportsPage,
});

const statuses: VoucherStatus[] = ["טרם שומש", "הוקצה לעובד", "מומש סופית", "חסום"];
const empty = { from: "", to: "", branch: "", supervisor: "", client: "", status: "" };

const reportTabs = [
  { id: "master", label: "דוח מאסטר", icon: Table2 },
  { id: "paz", label: "דוח קש פז", icon: Fuel },
] as const;

function ReportsPage() {
  const [tab, setTab] = useState<string>("master");
  const vouchers = useAppStore((s) => s.vouchers);
  const branchList = useAppStore((s) => s.branchList);
  const users = useAppStore((s) => s.users);
  const clients = useAppStore((s) => s.clients);
  const [filters, setFilters] = useState(empty);

  const supervisors = useMemo(
    () => users.filter((u) => u.role === "supervisor").map((u) => fullName(u)),
    [users],
  );
  const clientOptions = useMemo(() => {
    const fromVouchers = vouchers.map((v) => v.client).filter(Boolean) as string[];
    const fromSettings = clients.map((c) => c.clientName);
    return Array.from(new Set([...fromVouchers, ...fromSettings]));
  }, [vouchers, clients]);

  const rows = useMemo(
    () =>
      vouchers.filter((v) => {
        if (filters.from && v.updatedAt < filters.from) return false;
        if (filters.to && v.updatedAt > filters.to) return false;
        if (filters.branch && v.branch !== filters.branch) return false;
        if (filters.supervisor && v.supervisor !== filters.supervisor) return false;
        if (filters.client && v.client !== filters.client) return false;
        if (filters.status && v.status !== filters.status) return false;
        return true;
      }),
    [vouchers, filters],
  );

  const total = rows.reduce((sum, v) => sum + v.amount, 0);
  const headers = [
    'מס"ד',
    "סיריאלי",
    "סכום",
    "שויך ל",
    "לקוח",
    "דורש ההקצאה",
    "גורם מאשר",
    "סטטוס",
    "תאריך עדכון",
  ];
  const cells = rows.map((v) => [
    v.serial,
    v.realCode,
    v.amount,
    formatAssignment(v),
    v.client ?? "—",
    v.requester ?? "—",
    v.approver ?? "—",
    v.status,
    v.updatedAt,
  ]);

  function exportExcel() {
    downloadCsv("master-report.csv", headers, cells);
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
<title>דוח מאסטר שוברים</title><style>
body{font-family:Assistant,Arial,sans-serif;padding:24px;color:#0f2445}
h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
th,td{border:1px solid #cbd5e1;padding:6px;text-align:right}th{background:#e8f0fb}
</style></head><body><h1>דוח מאסטר שוברים · רשף ביטחון</h1>
<p>${rows.length} רשומות · סה"כ ${total.toLocaleString("he-IL")} ₪</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
    toast.success("הדוח נשלח להפקת PDF");
  }

  return (
    <InternalLayout title="דוחות">
      <Card padding="lg">
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
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              aria-label="מתאריך"
            />
          </FormField>
          <FormField label="עד תאריך">
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              aria-label="עד תאריך"
            />
          </FormField>
          <FormField label="סניף">
            <Select
              value={filters.branch}
              onChange={(e) => setFilters({ ...filters, branch: e.target.value })}
              aria-label="סניף"
            >
              <option value="">כל הסניפים</option>
              <option value="מאגר ראשי">מאגר ראשי</option>
              {branchList.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="מפקח">
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

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold text-secondary">דוח מאסטר</h2>
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

        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>מס"ד</TableHeaderCell>
                <TableHeaderCell>סיריאלי</TableHeaderCell>
                <TableHeaderCell>סכום</TableHeaderCell>
                <TableHeaderCell>שויך ל</TableHeaderCell>
                <TableHeaderCell>לקוח</TableHeaderCell>
                <TableHeaderCell>דורש ההקצאה</TableHeaderCell>
                <TableHeaderCell>גורם מאשר</TableHeaderCell>
                <TableHeaderCell>סטטוס</TableHeaderCell>
                <TableHeaderCell>תאריך עדכון</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    לא נמצאו רשומות מתאימות לסינון
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((v) => (
                  <TableRow key={v.serial}>
                    <TableCell className="font-semibold tabular-nums">{v.serial}</TableCell>
                    <TableCell dir="ltr" className="text-start tabular-nums">
                      {v.realCode}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {v.amount.toLocaleString("he-IL")} ₪
                    </TableCell>
                    <TableCell>{formatAssignment(v)}</TableCell>
                    <TableCell>{v.client ?? "—"}</TableCell>
                    <TableCell>{v.requester ?? "—"}</TableCell>
                    <TableCell>{v.approver ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[v.status]} size="md">
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {heDate.format(new Date(v.updatedAt))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </InternalLayout>
  );
}
