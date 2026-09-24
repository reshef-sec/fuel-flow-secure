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
import type { VoucherRecord } from "@/components/dashboard/voucherData";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";

const headers = [
  "סניף",
  "ערך כרטיס",
  'מס"ד כרטיס',
  "שם לקוח",
  "קוד לקוח",
  "שם חשבון",
  "תקן",
  "תאריך מסירה",
  "סיבת הפקה",
  "דורש הקצאה",
  "מאשר הקצאה",
];

/** B2B billing report — one row per 100 ₪ code issued via the "בחיוב לקוח" route. */
export function B2bReport() {
  const vouchers = useAppStore((s) => s.vouchers);
  const branchList = useAppStore((s) => s.branchList);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();
  const myName = me ? fullName(me) : "";

  const rows = useMemo(() => {
    let list = vouchers.filter((v) => v.route === "b2b");
    if (role === "branch" && me?.branch) list = list.filter((v) => v.branch === me.branch);
    if (role === "supervisor") list = list.filter((v) => v.supervisor === myName);
    // Split multi-code vouchers into one row per 100 ₪ code.
    return list.flatMap((v) => {
      const n = Math.max(1, Math.round(v.amount / 100));
      if (n === 1) return [{ v, value: v.amount, code: v.serial }];
      return Array.from({ length: n }, (_, i) => ({ v, value: 100, code: `${v.serial}-${i + 1}` }));
    });
  }, [vouchers, role, me?.branch, myName]);

  const requesterOf = (v: VoucherRecord) =>
    v.requester ?? branchList.find((b) => b.name === v.branch)?.manager ?? "—";

  const flat = rows.map(({ v, value, code }) => [
    v.branch,
    `${value} ₪`,
    code,
    v.client ?? "—",
    v.clientCode ?? v.clientId ?? "—",
    v.accountName ?? v.siteName ?? "—",
    v.standard ?? v.standardName ?? "—",
    heDate(v.deliveredAt ?? v.updatedAt),
    v.reason ?? "—",
    requesterOf(v),
    v.approver ?? "—",
  ]);
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold text-secondary">דו"ח B2B</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} כרטיסים · סה"כ {total.toLocaleString("he-IL")} ₪
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            downloadCsv("b2b-report.csv", headers, flat);
            toast.success('דו"ח B2B יוצא לאקסל');
          }}
        >
          <FileDown className="size-4" />
          ייצוא לאקסל
        </Button>
      </div>
      <div className="mt-4 overflow-x-auto">
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
                <TableCell colSpan={headers.length} className="py-10 text-center text-muted-foreground">
                  אין שוברים שהופקו בחיוב לקוח
                </TableCell>
              </TableRow>
            ) : (
              flat.map((cells, i) => (
                <TableRow key={`${rows[i]!.code}-${i}`}>
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
