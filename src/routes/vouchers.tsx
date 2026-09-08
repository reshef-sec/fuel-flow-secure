import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { InternalLayout } from "@/components/layout/InternalLayout";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { heDate, statusVariant } from "@/components/dashboard/statusVariant";
import type { VoucherRecord } from "@/components/dashboard/voucherData";
import { useAppStore } from "@/store/appStore";

export const Route = createFileRoute("/vouchers")({
  head: () => ({
    meta: [
      { title: "מאגר שוברים | רשף ביטחון" },
      {
        name: "description",
        content: "מאגר שוברי הדלק: ייבוא קבצי אקסל, מלאי, קודים וסטטוסים.",
      },
      { property: "og:title", content: "מאגר שוברים | רשף ביטחון" },
      { property: "og:description", content: "ייבוא שוברי דלק וניהול מלאי השוברים." },
    ],
  }),
  component: VouchersPage,
});

function VouchersPage() {
  const [dragging, setDragging] = useState(false);
  const [imported, setImported] = useState<VoucherRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const importVouchers = useAppStore((s) => s.importVouchers);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error("יש להעלות קובץ אקסל (xlsx, xls) או CSV");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const rows: VoucherRecord[] = Array.from({ length: 8 }, () => ({
      serial: String(Math.floor(100000 + Math.random() * 899999)),
      amount: [100, 200, 300, 500][Math.floor(Math.random() * 4)]!,
      assignedTo: "מאגר ראשי",
      status: "טרם שומש",
      updatedAt: today,
    }));
    setImported(rows);
    importVouchers(rows);
    toast.success(`הקובץ "${file.name}" נטען · ${rows.length} שוברים נוספו למאגר`);
  }

  return (
    <InternalLayout title="מאגר שוברים">
      <Card padding="lg">
        <CardHeader>
          <CardTitle>ייבוא שוברים מקובץ אקסל</CardTitle>
        </CardHeader>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center transition-colors",
            dragging ? "border-primary bg-blue-100" : "border-border bg-surface-muted",
          )}
        >
          <span className="grid size-14 place-items-center rounded-xl bg-blue-100 text-blue-700">
            <UploadCloud className="size-7" />
          </span>
          <p className="font-display text-base font-extrabold text-secondary">
            גרור לכאן קובץ אקסל של שוברים
          </p>
          <p className="text-sm text-muted-foreground">
            נתמכים קבצי xlsx, xls ו-CSV · עד 5,000 שורות בייבוא אחד
          </p>
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
            <FileSpreadsheet className="size-4" />
            בחירת קובץ
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label="בחירת קובץ שוברים"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </Card>

      <section className="mt-8">
        <h2 className="font-display text-xl font-extrabold text-secondary">שוברים שיובאו</h2>
        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>מס"ד</TableHeaderCell>
                <TableHeaderCell>סכום</TableHeaderCell>
                <TableHeaderCell>שויך ל</TableHeaderCell>
                <TableHeaderCell>סטטוס</TableHeaderCell>
                <TableHeaderCell>תאריך עדכון</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {imported.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    עדיין לא יובאו שוברים בהעלאה זו
                  </TableCell>
                </TableRow>
              ) : (
                imported.map((v) => (
                  <TableRow key={v.serial}>
                    <TableCell className="font-semibold tabular-nums">{v.serial}</TableCell>
                    <TableCell className="tabular-nums">
                      {v.amount.toLocaleString("he-IL")} ₪
                    </TableCell>
                    <TableCell>{v.assignedTo}</TableCell>
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
