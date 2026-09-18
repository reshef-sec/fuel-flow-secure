import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Pencil, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Card,
  FormField,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { downloadCsv } from "@/components/dashboard/statusVariant";
import { isSheetFile, parseSheetFile, stripHeader } from "@/lib/parseSheet";
import { useAppStore } from "@/store/appStore";

const empty = { clientId: "", clientName: "", siteId: "", siteName: "" };

export function ClientsPanel() {
  const clients = useAppStore((s) => s.clients);
  const addClient = useAppStore((s) => s.addClient);
  const updateClient = useAppStore((s) => s.updateClient);
  const importClients = useAppStore((s) => s.importClients);
  const removeClient = useAppStore((s) => s.removeClient);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ clientId: string; siteId: string } | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const PAGE_SIZE = 25;
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.clientId, c.clientName, c.siteId, c.siteName].some((v) => v.includes(q)),
    );
  }, [clients, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isSheetFile(file.name)) {
      toast.error("יש להעלות קובץ אקסל (xlsx, xls) או CSV");
      return;
    }
    try {
      const raw = stripHeader(await parseSheetFile(file), "לקוח");
      const rows = raw
        .filter((r) => (r[0] ?? "").length > 0 && (r[2] ?? "").length > 0)
        .map((r) => ({
          clientId: String(r[0] ?? "").trim(),
          clientName: String(r[1] ?? "").trim(),
          siteId: String(r[2] ?? "").trim(),
          siteName: String(r[3] ?? "").trim(),
        }));
      if (rows.length === 0) {
        toast.error("לא נמצאו שורות תקינות. עמודות: מס' לקוח, שם לקוח, מספר אתר, שם אתר");
        return;
      }
      importClients(rows);
      setPage(0);
      toast.success(`הקובץ "${file.name}" נטען · ${rows.length.toLocaleString("he-IL")} אתרים`);
    } catch {
      toast.error("קריאת הקובץ נכשלה. יש לוודא שהקובץ תקין");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId.trim() || !form.clientName.trim() || !form.siteId.trim() || !form.siteName.trim()) {
      setError("יש למלא את כל השדות");
      return;
    }
    if (clients.some((c) => c.clientId === form.clientId.trim() && c.siteId === form.siteId.trim())) {
      setError("שילוב לקוח ואתר זה קיים כבר");
      return;
    }
    setError(null);
    addClient({
      clientId: form.clientId.trim(),
      clientName: form.clientName.trim(),
      siteId: form.siteId.trim(),
      siteName: form.siteName.trim(),
    });
    setForm(empty);
    setOpen(false);
    toast.success("הלקוח נוסף בהצלחה");
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-secondary">
          לקוחות ואתרים
          <span className="ms-2 text-sm font-semibold text-muted-foreground">
            {filtered.length.toLocaleString("he-IL")} מתוך {clients.length.toLocaleString("he-IL")}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="חיפוש לקוח או אתר"
              aria-label="חיפוש לקוחות ואתרים"
              className="w-64 pe-9"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              downloadCsv(
                "clients-template.csv",
                ["מס' לקוח", "שם לקוח", "מספר אתר", "שם אתר"],
                [["1001", "שם לקוח לדוגמה", "11", "שם אתר לדוגמה"]],
              );
              toast.success("תבנית הלקוחות הורדה");
            }}
          >
            <FileSpreadsheet className="size-4" />
            הורד תבנית אקסל
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            הוספה ידנית
          </Button>
        </div>
      </div>

      <Card padding="lg" className="mt-4">
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
            "flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center transition-colors",
            dragging ? "border-primary bg-blue-100" : "border-border bg-surface-muted",
          )}
        >
          <span className="grid size-12 place-items-center rounded-xl bg-blue-100 text-blue-700">
            <UploadCloud className="size-6" />
          </span>
          <p className="font-display text-base font-extrabold text-secondary">
            ייבוא לקוחות ואתרים מקובץ אקסל
          </p>
          <p className="text-sm text-muted-foreground">
            עמודות נדרשות: מס' לקוח, שם לקוח, מספר אתר, שם אתר
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
            aria-label="בחירת קובץ לקוחות"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </Card>

      <div className="mt-6">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>מס' לקוח</TableHeaderCell>
              <TableHeaderCell>שם לקוח</TableHeaderCell>
              <TableHeaderCell>מספר אתר</TableHeaderCell>
              <TableHeaderCell>שם אתר</TableHeaderCell>
              <TableHeaderCell>פעולות</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  לא נמצאו לקוחות או אתרים מתאימים
                </TableCell>
              </TableRow>
            ) : (
              visible.map((c) => (
                <TableRow key={`${c.clientId}-${c.siteId}`}>
                  <TableCell className="tabular-nums font-semibold">{c.clientId}</TableCell>
                  <TableCell>{c.clientName}</TableCell>
                  <TableCell className="tabular-nums">{c.siteId}</TableCell>
                  <TableCell>{c.siteName}</TableCell>
                  <TableCell>
                    <button
                      aria-label={`מחק ${c.siteName}`}
                      onClick={() => {
                        removeClient(c.clientId, c.siteId);
                        toast.success("האתר נמחק");
                      }}
                      className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-danger focus-visible:shadow-focus"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          עמוד {current + 1} מתוך {pageCount}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronRight className="size-4" />
            הקודם
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            הבא
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="הוספת לקוח ואתר">
        <form onSubmit={submit} className="space-y-5">
          <FormField label="מס' לקוח">
            <Input
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              inputMode="numeric"
              aria-label="מס' לקוח"
              className="tabular-nums"
            />
          </FormField>
          <FormField label="שם לקוח">
            <Input
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              aria-label="שם לקוח"
            />
          </FormField>
          <FormField label="מספר אתר">
            <Input
              value={form.siteId}
              onChange={(e) => setForm({ ...form, siteId: e.target.value })}
              inputMode="numeric"
              aria-label="מספר אתר"
              className="tabular-nums"
            />
          </FormField>
          <FormField label="שם אתר">
            <Input
              value={form.siteName}
              onChange={(e) => setForm({ ...form, siteName: e.target.value })}
              aria-label="שם אתר"
            />
          </FormField>

          {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit">הוספה</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
