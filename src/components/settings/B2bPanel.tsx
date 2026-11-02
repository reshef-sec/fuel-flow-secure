import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Pencil, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

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
import { Modal } from "@/components/ui/Modal";
import { downloadCsv } from "@/components/dashboard/statusVariant";
import { isSheetFile, parseSheetFile, stripHeader } from "@/lib/parseSheet";
import { useAppStore, type B2BClientRecord } from "@/store/appStore";
import { branchLabel } from "@/lib/branchLabels";
import { workVehicleKey } from "@/lib/workVehicles";

type Key = Exclude<keyof B2BClientRecord, "isActive">;
/** Exact Excel column order (RTL). */
const columns: { key: Key; label: string; required?: boolean }[] = [
  { key: "standard", label: "תקן", required: true },
  { key: "accountName", label: "שם חשבון", required: true },
  { key: "balance", label: 'יתרת הנה"ש' },
  { key: "clientCode", label: "קוד לקוח", required: true },
  { key: "clientName", label: "שם לקוח", required: true },
  { key: "loadType", label: "סוג העמסה" },
  { key: "branch", label: "סניף", required: true },
  { key: "budgetSection", label: "סעיף תקציבי" },
  { key: "accountKey", label: "מפתח חשבון אב" },
  { key: "itemFamily", label: "משפחת פריטים" },
  { key: "accountStatus", label: "חשבון [פעיל/כותרת]" },
  { key: "accountType", label: "סוג חשבון" },
];
const cols = columns.map((c) => c.label);
const empty = Object.fromEntries(columns.map((c) => [c.key, ""])) as unknown as Required<B2BClientRecord>;
const norm = (h: string) => h.replace(/["'״׳\s\[\]\/]/g, "");

export function B2bPanel() {
  const rows = useAppStore((s) => s.b2bClients);
  const branchList = useAppStore((s) => s.branchList);
  const addB2b = useAppStore((s) => s.addB2b);
  const updateB2b = useAppStore((s) => s.updateB2b);
  const importB2b = useAppStore((s) => s.importB2b);
  const removeB2b = useAppStore((s) => s.removeB2b);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<B2BClientRecord | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? "").includes(q)));
  }, [rows, query]);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isSheetFile(file.name)) {
      toast.error("יש להעלות קובץ אקסל (xlsx, xls) או CSV");
      return;
    }
    try {
      const all = await parseSheetFile(file);
      const headerIdx = all.findIndex((r) => r.some((c) => norm(c) === norm("תקן")) && r.some((c) => norm(c) === norm("קוד לקוח")));
      if (headerIdx < 0) {
        toast.error(`לא נמצאה שורת כותרות. עמודות: ${cols.join(", ")}`);
        return;
      }
      const header = (all[headerIdx] ?? []).map(norm);
      const index = Object.fromEntries(columns.map((c) => [c.key, header.indexOf(norm(c.label))]));
      const parsed = all
        .slice(headerIdx + 1)
        .map((r) => {
          const row = {} as Record<Key, string>;
          for (const c of columns) {
            const position = index[c.key];
            row[c.key] = position !== undefined && position >= 0 ? String(r[position] ?? "").trim() : "";
          }
          return row as unknown as B2BClientRecord;
        });
      if (!parsed.length) {
        toast.error(`לא נמצאו שורות תקינות. עמודות: ${cols.join(", ")}`);
        return;
      }
      const { added, updated, deactivated, duplicates = 0, blanks = 0 } = await importB2b(parsed);
      toast.success(`נוספו ${added} חדשים, ${updated} עודכנו, ${deactivated} סומנו כלא פעילים · ${duplicates} כפולים ו־${blanks} שורות ריקות דולגו`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "סנכרון הקובץ נכשל");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, String(v ?? "").trim()]),
    ) as unknown as B2BClientRecord;
    if (columns.some((c) => c.required && !p[c.key])) {
      setError("יש למלא תקן, שם חשבון, קוד לקוח, שם לקוח וסניף");
      return;
    }
    const clash = rows.some(
      (r) =>
        r.clientCode === p.clientCode &&
        r.standard === p.standard &&
        !(editing && r.clientCode === editing.clientCode && r.standard === editing.standard),
    );
    if (clash) {
      setError("תקן זה כבר קיים ללקוח");
      return;
    }
    if (editing) {
      updateB2b(editing.clientCode, editing.standard, p);
      toast.success("הרשומה עודכנה");
    } else {
      addB2b(p);
      toast.success("הרשומה נוספה");
    }
    setOpen(false);
    setEditing(null);
    setForm(empty);
    setError(null);
  }

  const fields = columns.filter((c) => c.key !== "branch");

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-secondary">מאגר רכב עבודה</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש"
              aria-label="חיפוש במאגר B2B"
              className="w-56 pe-9"
            />
          </div>
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv("b2b-template.csv", cols, [columns.map((c) => (c.key === "branch" ? "צפון" : ""))])
            }
          >
            <FileSpreadsheet className="size-4" />
            הורד תבנית
          </Button>
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <UploadCloud className="size-4" />
            ייבוא מאקסל
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label="קובץ B2B"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setError(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            הוספה
          </Button>
        </div>
      </div>

      <Card padding="none" className="mt-4 overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              {cols.map((c) => (
                <TableHeaderCell key={c}>{c}</TableHeaderCell>
              ))}
              <TableHeaderCell>סטטוס</TableHeaderCell>
              <TableHeaderCell>פעולות</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 2} className="py-10 text-center text-muted-foreground">
                  אין רשומות
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={workVehicleKey(r)} className={r.isActive !== true ? "work-vehicle-inactive" : undefined} title={r.isActive !== true ? "לא פעיל — לא הופיע בייבוא האחרון" : undefined}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className="whitespace-nowrap">
                      {c.key === "branch" && r.branch ? branchLabel(r.branch) : r[c.key] || "—"}
                    </TableCell>
                  ))}
                  <TableCell><Badge variant={r.isActive === true ? "success" : "danger"}>{r.isActive === true ? "פעיל" : "לא פעיל"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`ערוך ${r.accountName}`}
                        onClick={() => {
                          setEditing(r);
                          setForm({ ...empty, ...r });
                          setError(null);
                          setOpen(true);
                        }}
                        className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-primary"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        aria-label={`מחק ${r.accountName}`}
                        onClick={() => {
                          removeB2b(r.clientCode, r.standard);
                          toast.success("הרשומה נמחקה");
                        }}
                        className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-danger"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "עריכת לקוח רכב עבודה" : "הוספת לקוח רכב עבודה"}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="סניף">
            <Select
              aria-label="סניף"
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
            >
              <option value="">בחר סניף…</option>
              {branchList.map((b) => (
                <option key={b.id} value={b.name}>
                  {branchLabel(b.name)}
                </option>
              ))}
            </Select>
          </FormField>
          {fields.map((f) => (
            <FormField key={f.key} label={f.label}>
              <Input
                aria-label={f.label}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </FormField>
          ))}
          {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit">{editing ? "שמירת שינויים" : "הוספה"}</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
