import { useMemo } from "react";
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
import { isWorkerVoucher, type VoucherRecord } from "@/components/dashboard/voucherData";
import { siteStandard, useAppStore, useCurrentUser } from "@/store/appStore";

const headers = [
  "סניף משייך",
  "ערך כרטיס",
  'מס"ד',
  "לקוח",
  "אתר",
  "תקן",
  "תאריך מסירה",
  "סיבת הפקה",
  "שם עובד",
  "ת.ז עובד",
  "דורש הקצאה",
  "מאשר ההקצאה",
];

/** Billing report — only vouchers handed to an end worker. */
export function PazReport() {
  const vouchers = useAppStore((s) => s.vouchers);
  const clients = useAppStore((s) => s.clients);
  const branchList = useAppStore((s) => s.branchList);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();

  const rows = useMemo(() => {
    const worker = vouchers.filter(isWorkerVoucher);
    if (role !== "branch" || !me?.branch) return worker;
    return worker.filter((v) => v.branch === me.branch);
  }, [vouchers, role, me?.branch]);

  /** Fallback for דורש הקצאה: the branch manager of the issuing branch. */
  const requesterOf = (v: VoucherRecord) =>
    v.requester ?? branchList.find((b) => b.name === v.branch)?.manager ?? "—";

  const clientCell = (v: VoucherRecord) =>
    v.clientId ? `${v.client ?? ""} (${v.clientId})`.trim() : (v.client ?? "—");
  const siteCell = (v: VoucherRecord) =>
    v.siteId ? `${v.siteName ?? ""} (${v.siteId})`.trim() : (v.siteName ?? "—");

  const cells = rows.map((v) => [
    v.branch,
    v.amount,
    v.serial,
    clientCell(v),
    siteCell(v),
    siteStandard(clients, v.clientId, v.siteId),
    v.deliveredAt ?? v.updatedAt,
    v.reason ?? "—",
    v.workerName ?? "—",
    v.workerId ?? "—",
    requesterOf(v),
    v.approver ?? "—",
  ]);

  const total = rows.reduce((sum, v) => sum + v.amount, 0);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold text-secondary">דוח קש פז</h2>
          <p className="text-sm tabular-nums text-muted-foreground">
            {rows.length} שוברים שנמסרו לעובדים · סה"כ {total.toLocaleString("he-IL")} ₪
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            downloadCsv("paz-billing-report.csv", headers, cells);
            toast.success("דוח קש פז יוצא לאקסל בהצלחה");
          }}
        >
          <FileDown className="size-4" />
          ייצוא לאקסל
        </Button>
      </div>

      <div className="mt-4">
        <Table>
          <TableHead>
            <TableRow>
              {headers.map((h) => (
                <TableHeaderCell key={h}>{h}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={headers.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  אין שוברים שנמסרו לעובדים
                </TableCell>
              </TableRow>
            ) : (
              rows.map((v) => (
                <TableRow key={v.serial}>
                  <TableCell className="font-semibold">{v.branch}</TableCell>
                  <TableCell className="tabular-nums">
                    {v.amount.toLocaleString("he-IL")} ₪
                  </TableCell>
                  <TableCell className="tabular-nums">{v.serial}</TableCell>
                  <TableCell>{clientCell(v)}</TableCell>
                  <TableCell>{siteCell(v)}</TableCell>
                  <TableCell className="text-center tabular-nums">
                    {siteStandard(clients, v.clientId, v.siteId)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {heDate.format(new Date(v.deliveredAt ?? v.updatedAt))}
                  </TableCell>
                  <TableCell>{v.reason ?? "—"}</TableCell>
                  <TableCell>{v.workerName ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{v.workerId ?? "—"}</TableCell>
                  <TableCell>{requesterOf(v)}</TableCell>
                  <TableCell>{v.approver ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
