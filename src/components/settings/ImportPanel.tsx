import { useMemo, useRef, useState } from "react";
import { FileDown, FileSpreadsheet, RefreshCcw, Search, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { statusVariant } from "@/components/dashboard/statusVariant";
import { formatAssignment } from "@/components/dashboard/voucherData";
import { FuelBadge } from "@/components/fuel/fuel";
import { Pager, usePaged } from "@/components/ui/Pager";
import { useVoucherImports } from "@/lib/useVoucherImports";
import { useAppStore } from "@/store/appStore";
import { templateColumns } from "@/lib/importTemplates";
import { downloadImportTemplate } from "@/lib/excel";


/** Compact drop zone used by both import tools. */
function DropZone({
  title,
  hint,
  button,
  icon: Icon,
  tone,
  onFiles,
}: {
  title: string;
  hint: string;
  button: string;
  icon: typeof UploadCloud;
  tone: "primary" | "accent";
  onFiles: (f: FileList | null) => void;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-dashed px-4 py-4 transition-colors",
        drag
          ? tone === "primary"
            ? "border-primary bg-blue-100"
            : "border-accent bg-mint-100"
          : "border-border bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-md",
          tone === "primary" ? "bg-blue-100 text-blue-700" : "bg-mint-100 text-teal-600",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-secondary">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}>
        <FileSpreadsheet className="size-3.5" />
        {button}
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        aria-label={button}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function ImportPanel() {
  const vouchers = useAppStore((s) => s.vouchers);
  const [validity, setValidity] = useState<Record<string, string>>({});
  const [recent, setRecent] = useState<string[]>([]);
  // Import logic is shared with the /vouchers page (same handlers, same parsers, same toasts).
  const { handleStock, handleRedeemed } = useVoucherImports({
    onStockImported: (serials, valid) => {
      setValidity((m) => ({ ...m, ...valid }));
      setRecent(serials);
    },
  });
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const ids = new Set(recent);
    const base = recent.length
      ? vouchers.filter((v) => ids.has(v.serial))
      : [...vouchers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const t = q.trim().toLowerCase();
    return t ? base.filter((v) => v.serial.toLowerCase().includes(t) || formatAssignment(v).toLowerCase().includes(t)) : base;
  }, [vouchers, recent, q]);
  const paged = usePaged(rows);

  function downloadTemplate() {
    void downloadImportTemplate("stock")
      .then(() => toast.success("תבנית האקסל הורדה"))
      .catch(() => toast.error("הורדת התבנית נכשלה"));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-extrabold text-secondary">ייבוא מלאי שוברים חדש</h3>
            <Button size="sm" variant="ghost" onClick={downloadTemplate}>
              <FileDown className="size-3.5" />
              הורדת תבנית אקסל
            </Button>
          </div>
          <DropZone
            title="גרור קובץ מלאי לכאן"
            hint="xlsx, xls, CSV · עד 5,000 שורות"
            button="בחירת קובץ"
            icon={UploadCloud}
            tone="primary"
            onFiles={handleStock}
          />
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-5 bg-surface-muted text-center text-[11px] font-bold text-secondary">
              {templateColumns.map((c, i) => (
                <span key={c.name} className="px-1 py-1.5">
                  <span className="text-muted-foreground">{String.fromCharCode(65 + i)} · </span>
                  {c.name}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-5 text-center text-[11px] tabular-nums text-muted-foreground">
              {templateColumns.map((c) => (
                <span key={c.name} className="truncate px-1 py-1.5">{c.example}</span>
              ))}
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-extrabold text-secondary">ייבוא אקסל מימושים מפז (היזון חוזר)</h3>
            <Badge variant="success" size="sm">
              <RefreshCcw className="size-3" />
              עדכון סטטוסים
            </Badge>
          </div>
          <DropZone
            title="גרור קובץ מימושים לכאן"
            hint='התאמה לפי מספר כרטיס (עמודה A) · עדכון ל"מומש סופית"'
            button="בחירת קובץ"
            icon={RefreshCcw}
            tone="accent"
            onFiles={handleRedeemed}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            כל כרטיס שמספרו מופיע בעמודה A בקובץ יסומן כמומש. כרטיסים שכבר מומשו או לא קיימים במאגר ידולגו.
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-base font-extrabold text-secondary">
            שוברים שיובאו לאחרונה
            <span className="ms-2 text-xs font-semibold text-muted-foreground">{rows.length} רשומות</span>
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="חיפוש שוברים" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש מספר כרטיס או שיוך…" className="ps-9" />
          </div>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>מספר כרטיס</TableHeaderCell>
              <TableHeaderCell>ערך</TableHeaderCell>
              <TableHeaderCell>סוג דלק</TableHeaderCell>
              <TableHeaderCell>תוקף</TableHeaderCell>
              <TableHeaderCell>שויך ל</TableHeaderCell>
              <TableHeaderCell>סטטוס</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.slice.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  לא נמצאו שוברים
                </TableCell>
              </TableRow>
            ) : (
              paged.slice.map((v) => (
                <TableRow key={v.serial}>
                  <TableCell className="font-semibold tabular-nums">{v.serial}</TableCell>
                  <TableCell className="tabular-nums">{v.amount.toLocaleString("he-IL")} ₪</TableCell>
                  <TableCell><FuelBadge fuel={v.fuelType} /></TableCell>
                  <TableCell className="tabular-nums">{validity[v.serial] || "—"}</TableCell>
                  <TableCell>{formatAssignment(v)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[v.status]} size="sm">{v.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pager {...paged} />
      </Card>
    </div>
  );
}
