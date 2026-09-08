import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown, FileSpreadsheet, UploadCloud } from "lucide-react";
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
import { downloadCsv, heDate, statusVariant } from "@/components/dashboard/statusVariant";
import {
  MAIN_POOL,
  formatAssignment,
  type VoucherRecord,
} from "@/components/dashboard/voucherData";
import { useAppStore } from "@/store/appStore";

export const Route = createFileRoute("/vouchers")({
  head: () => ({
    meta: [
      { title: "מאגר שוברים | רשף ביטחון" },
      {
        name: "description",
        content: "מאגר שוברי הדלק: ייבוא קבצי אקסל, תבנית ייבוא, מלאי, קודים וסטטוסים.",
      },
      { property: "og:title", content: "מאגר שוברים | רשף ביטחון" },
      { property: "og:description", content: "ייבוא שוברי דלק וניהול מלאי השוברים." },
    ],
  }),
  component: VouchersPage,
});

const templateColumns = [
  { name: 'מס"ד', example: "019949" },
  { name: "סיריאלי", example: "RB-4417-9902" },
  { name: "סכום", example: "150" },
  { name: "תאריך הזנה", example: "2026-09-01" },
];

function VouchersPage() {
  const [dragging, setDragging] = useState(false);
  const [imported, setImported] = useState<VoucherRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const importVouchers = useAppStore((s) => s.importVouchers);

  function downloadTemplate() {
    downloadCsv(
      "vouchers-template.csv",
      templateColumns.map((c) => c.name),
      [templateColumns.map((c) => c.example)],
    );
    toast.success("תבנית האקסל הורדה");
  }

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
      realCode: `RB-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`,
      amount: [100, 200, 300, 500][Math.floor(Math.random() * 4)]!,
      branch: MAIN_POOL,
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
          <Button variant="outline" onClick={downloadTemplate}>
            <FileDown className="size-4" />
            הורד תבנית אקסל
          </Button>
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

        <div className="mt-6 rounded-xl border border-border bg-surface-muted p-5">
          <p className="font-display text-sm font-extrabold text-secondary">
            עמודות נדרשות בקובץ הייבוא
          </p>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  {templateColumns.map((c) => (
                    <TableHeaderCell key={c.name}>{c.name}</TableHeaderCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  {templateColumns.map((c) => (
                    <TableCell key={c.name} className="tabular-nums text-muted-foreground">
                      {c.example}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            שורת הכותרות חייבת להיות ראשונה בקובץ, בסדר העמודות המוצג למעלה.
          </p>
        </div>
      </Card>

      <section className="mt-8">
        <h2 className="font-display text-xl font-extrabold text-secondary">שוברים שיובאו</h2>
        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>מס"ד</TableHeaderCell>
                <TableHeaderCell>סיריאלי</TableHeaderCell>
                <TableHeaderCell>סכום</TableHeaderCell>
                <TableHeaderCell>שויך ל</TableHeaderCell>
                <TableHeaderCell>סטטוס</TableHeaderCell>
                <TableHeaderCell>תאריך הזנה</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {imported.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    עדיין לא יובאו שוברים בהעלאה זו
                  </TableCell>
                </TableRow>
              ) : (
                imported.map((v) => (
                  <TableRow key={v.serial}>
                    <TableCell className="font-semibold tabular-nums">{v.serial}</TableCell>
                    <TableCell dir="ltr" className="text-start tabular-nums">
                      {v.realCode}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {v.amount.toLocaleString("he-IL")} ₪
                    </TableCell>
                    <TableCell>{formatAssignment(v)}</TableCell>
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
