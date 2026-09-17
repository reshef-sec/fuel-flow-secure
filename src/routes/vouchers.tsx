import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown, FileSpreadsheet, RefreshCcw, UploadCloud } from "lucide-react";
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
import { isSheetFile, parseSheetFile, stripHeader } from "@/lib/parseSheet";
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
  const [pazDragging, setPazDragging] = useState(false);
  const [imported, setImported] = useState<VoucherRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pazInputRef = useRef<HTMLInputElement>(null);
  const importVouchers = useAppStore((s) => s.importVouchers);
  const markSerialsRedeemed = useAppStore((s) => s.markSerialsRedeemed);

  async function handlePazFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isSheetFile(file.name)) {
      toast.error("יש להעלות קובץ אקסל (xlsx, xls) או CSV");
      return;
    }
    try {
      const raw = stripHeader(await parseSheetFile(file), "מס");
      const serials = raw.map((r) => String(r[0] ?? "").trim()).filter(Boolean);
      if (serials.length === 0) {
        toast.error("לא נמצאו מספרי שוברים בקובץ ההיזון החוזר");
        return;
      }
      const updated = markSerialsRedeemed(serials);
      if (updated === 0) {
        toast.info("מספרי השוברים בקובץ לא נמצאו במאגר או שכבר מומשו");
        return;
      }
      toast.success(`היזון חוזר נטען · ${updated} שוברים עודכנו ל"מומש סופית"`);
    } catch {
      toast.error("קריאת הקובץ נכשלה. יש לוודא שהקובץ תקין");
    }
  }


  function downloadTemplate() {
    downloadCsv(
      "vouchers-template.csv",
      templateColumns.map((c) => c.name),
      [templateColumns.map((c) => c.example)],
    );
    toast.success("תבנית האקסל הורדה");
  }

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isSheetFile(file.name)) {
      toast.error("יש להעלות קובץ אקסל (xlsx, xls) או CSV");
      return;
    }
    try {
      const raw = stripHeader(await parseSheetFile(file), "מס");
      const today = new Date().toISOString().slice(0, 10);
      const rows: VoucherRecord[] = raw
        .filter((r) => (r[0] ?? "").length > 0)
        .map((r) => ({
          serial: String(r[0] ?? "").trim(),
          realCode: String(r[1] ?? "").trim(),
          amount: Number(String(r[2] ?? "").replace(/[^\d.]/g, "")) || 0,
          branch: MAIN_POOL,
          status: "טרם שומש" as const,
          updatedAt: String(r[3] ?? "").trim() || today,
        }));
      if (rows.length === 0) {
        toast.error("לא נמצאו שורות תקינות בקובץ. יש להשתמש בתבנית האקסל");
        return;
      }
      setImported(rows);
      importVouchers(rows);
      toast.success(`הקובץ "${file.name}" נטען · ${rows.length} שוברים נוספו למאגר`);
    } catch {
      toast.error("קריאת הקובץ נכשלה. יש לוודא שהקובץ תקין");
    }
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

      <Card padding="lg" className="mt-8">
        <CardHeader>
          <CardTitle>ייבוא אקסל מימושים מפז (היזון חוזר)</CardTitle>
          <Badge variant="success" size="md">
            <RefreshCcw className="size-3.5" />
            עדכון סטטוסים
          </Badge>
        </CardHeader>
        <p className="text-sm text-muted-foreground">
          ייבוא דוח החיוב החיצוני של פז מעדכן את סטטוס השוברים שנמסרו לעובדים ל"מומש סופית", בהתאם
          למימושים שדווחו בדוח.
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setPazDragging(true);
          }}
          onDragLeave={() => setPazDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setPazDragging(false);
            handlePazFile(e.dataTransfer.files);
          }}
          className={cn(
            "mt-5 flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center transition-colors",
            pazDragging ? "border-accent bg-mint-100" : "border-border bg-surface-muted",
          )}
        >
          <span className="grid size-14 place-items-center rounded-xl bg-mint-100 text-teal-600">
            <RefreshCcw className="size-7" />
          </span>
          <p className="font-display text-base font-extrabold text-secondary">
            גרור לכאן את קובץ ההיזון החוזר מפז
          </p>
          <p className="text-sm text-muted-foreground">
            נתמכים קבצי xlsx, xls ו-CSV · הקובץ מזוהה לפי מספר סיריאלי
          </p>
          <Button type="button" variant="outline" onClick={() => pazInputRef.current?.click()}>
            <FileSpreadsheet className="size-4" />
            בחירת קובץ מימושים
          </Button>
          <input
            ref={pazInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label="בחירת קובץ מימושים מפז"
            onChange={(e) => handlePazFile(e.target.files)}
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
