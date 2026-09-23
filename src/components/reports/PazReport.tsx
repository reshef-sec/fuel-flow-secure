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
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";

const headers = [
  "סניף משייך",
  "ערך כרטיס",
  'מס"ד',
  "קוד ושם לקוח",
  "אתר/פרויקט",
  "שם תקן",
  "רישוי רכב",
  "שם נהג",
  "תאריך מסירה",
  "סיבת הפקה",
  "דורש הקצאה",
  "מאשר הקצאה",
];

/** Billing report — only vouchers handed to an end worker, joined with vehicles & clients. */
export function PazReport() {
  const vouchers = useAppStore((s) => s.vouchers);
  const clients = useAppStore((s) => s.clients);
  const vehicles = useAppStore((s) => s.vehicles);
  const branchList = useAppStore((s) => s.branchList);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();

  const myName = me ? fullName(me) : "";
  const rows = useMemo(() => {
    const worker = vouchers.filter(isWorkerVoucher);
    if (role === "branch" && me?.branch) return worker.filter((v) => v.branch === me.branch);
    if (role === "supervisor") return worker.filter((v) => v.supervisor === myName);
    return worker;
  }, [vouchers, role, me?.branch, myName]);

  /** Vehicle linked to the voucher — by plate, else by the worker/driver name. */
  const vehicleOf = (v: VoucherRecord) =>
    vehicles.find((x) => x.licensePlate === v.licensePlate) ??
    vehicles.find((x) => x.driverName === (v.driverName ?? v.workerName));

  /** Flattens one voucher into the 12 report columns, joining vehicles + clients. */
  function flatten(v: VoucherRecord) {
    const vehicle = vehicleOf(v);
    const clientCode = vehicle?.linkedClientCode ?? v.clientId ?? "";
    const siteCode = vehicle?.linkedSiteCode ?? v.siteId ?? "";
    const site = clients.find((c) => c.clientId === clientCode && c.siteId === siteCode);
    const clientCell = clientCode
      ? `${clientCode} · ${site?.clientName ?? v.client ?? "—"}`
      : (v.client ?? "—");
    const siteCell = siteCode
      ? `${site?.siteName ?? v.siteName ?? "—"} (${siteCode})`
      : (v.siteName ?? "—");
    const requester =
      v.requester ?? branchList.find((b) => b.name === v.branch)?.manager ?? "—";
    return {
      branch: v.branch,
      amount: v.amount,
      serial: v.serial,
      clientCell,
      siteCell,
      standardName: vehicle?.standardName ?? site?.standard ?? "—",
      licensePlate: vehicle?.licensePlate ?? v.licensePlate ?? "—",
      driverName: vehicle?.driverName ?? v.driverName ?? v.workerName ?? "—",
      deliveredAt: v.deliveredAt ?? v.updatedAt,
      reason: v.reason ?? "—",
      requester,
      approver: v.approver ?? "—",
    };
  }

  const flat = rows.map(flatten);
  const cells = flat.map((r) => [
    r.branch,
    r.amount,
    r.serial,
    r.clientCell,
    r.siteCell,
    r.standardName,
    r.licensePlate,
    r.driverName,
    r.deliveredAt,
    r.reason,
    r.requester,
    r.approver,
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
            {flat.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={headers.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  אין שוברים שנמסרו לעובדים
                </TableCell>
              </TableRow>
            ) : (
              flat.map((r) => (
                <TableRow key={r.serial}>
                  <TableCell className="font-semibold">{r.branch}</TableCell>
                  <TableCell className="tabular-nums">
                    {r.amount.toLocaleString("he-IL")} ₪
                  </TableCell>
                  <TableCell className="tabular-nums">{r.serial}</TableCell>
                  <TableCell>{r.clientCell}</TableCell>
                  <TableCell>{r.siteCell}</TableCell>
                  <TableCell className="text-center">{r.standardName}</TableCell>
                  <TableCell className="tabular-nums" dir="ltr">
                    {r.licensePlate}
                  </TableCell>
                  <TableCell>{r.driverName}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {heDate.format(new Date(r.deliveredAt))}
                  </TableCell>
                  <TableCell>{r.reason}</TableCell>
                  <TableCell>{r.requester}</TableCell>
                  <TableCell>{r.approver}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
