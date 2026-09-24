import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Pencil, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import {
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

const empty: B2BClientRecord = { branch: "", accountName: "", clientCode: "", clientName: "", standard: "" };
const cols = ["סניף", "שם חשבון", "קוד לקוח", "שם לקוח", "תקן"] as const;

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
    return rows.filter((r) => Object.values(r).some((v) => v.includes(q)));
  }, [rows, query]);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isSheetFile(file.name)) {
      toast.error("יש להעלות קובץ אקסל (xlsx, xls) או CSV");
      return;
    }
    try {
      const raw = stripHeader(await parseSheetFile(file), "סניף");
      const parsed = raw
        .map((r) => ({
          branch: String(r[0] ?? "").trim(),
          accountName: String(r[1] ?? "").trim(),
          clientCode: String(r[2] ?? "").trim(),
          clientName: String(r[3] ?? "").trim(),
          standard: String(r[4] ?? "").trim(),
        }))
        .filter((r) => r.clientCode && r.accountName && r.clientName);
      if (!parsed.length) {
        toast.error(`לא נמצאו שורות תקינות. עמודות: ${cols.join(", ")}`);
        return;
      }
      const { added, updated } = importB2b(parsed);
      toast.success(`נוספו ${added}, עודכנו ${updated}`);
    } catch {
      toast.error("קריאת הקובץ נכשלה");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v.trim()]),
    ) as unknown as B2BClientRecord;
    if (Object.values(p).some((v) => !v)) {
      setError("יש למלא את כל השדות");
      return;
    }
    const clash = rows.some(
      (r) =>
        r.clientCode === p.clientCode &&
        r.accountName === p.accountName &&
        !(editing && r.clientCode === editing.clientCode && r.accountName === editing.accountName),
    );
    if (clash) {
      setError("חשבון זה כבר קיים ללקוח");
      return;
    }
    if (editing) {
      updateB2b(editing.clientCode, editing.accountName, p);
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

  const fields: { key: keyof B2BClientRecord; label: string }[] = [
    { key: "accountName", label: "שם חשבון" },
    { key: "clientCode", label: "קוד לקוח" },
    { key: "clientName", label: "שם לקוח" },
    { key: "standard", label: "תקן" },
  ];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-secondary">מאגר B2B</h2>
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
              downloadCsv("b2b-template.csv", [...cols], [["צפון", "שם חשבון", "100", "שם לקוח", "תקן 1001"]])
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
              <TableHeaderCell>פעולות</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  אין רשומות
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={`${r.clientCode}|${r.accountName}`}>
                  <TableCell>{r.branch}</TableCell>
                  <TableCell>{r.accountName}</TableCell>
                  <TableCell className="tabular-nums">{r.clientCode}</TableCell>
                  <TableCell>{r.clientName}</TableCell>
                  <TableCell>{r.standard}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`ערוך ${r.accountName}`}
                        onClick={() => {
                          setEditing(r);
                          setForm(r);
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
                          removeB2b(r.clientCode, r.accountName);
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "עריכת לקוח B2B" : "הוספת לקוח B2B"}>
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
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
          {fields.map((f) => (
            <FormField key={f.key} label={f.label}>
              <Input
                aria-label={f.label}
                value={form[f.key]}
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
