import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Plus, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button, FormField, Input, Select } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { DataTable, EmptyRow, KV, MobileCardList } from "@/components/ui/DataTable";
import { FilterChips } from "@/components/ui/FilterChips";
import { Pager, usePaged } from "@/components/ui/Pager";
import { ResultDialog, type ResultSummary } from "@/components/ui/ResultDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { isSheetFile, parseSheetFile } from "@/lib/parseSheet";
import { parseWorkVehicleSheet } from "@/lib/workVehicleSheet";
import { isReadOnlyRole, useAppStore, type B2BClientRecord } from "@/store/appStore";
import { branchLabel } from "@/lib/branchLabels";
import { workVehicleKey } from "@/lib/workVehicles";
import { workVehicleColumns } from "@/lib/importTemplates";
import { downloadImportTemplate } from "@/lib/excel";
import { SearchField, SettingsCard } from "./shared";

type Key = Exclude<keyof B2BClientRecord, "isActive">;
/** Exact Excel column order (RTL) — shared with the template download (src/lib/importTemplates.ts). */
const columns: { key: Key; label: string; required?: boolean }[] = workVehicleColumns;
const cols = columns.map((c) => c.label);
const empty = Object.fromEntries(columns.map((c) => [c.key, ""])) as unknown as Required<B2BClientRecord>;

type ActiveFilter = "all" | "active" | "inactive";

export function B2bPanel() {
  const rows = useAppStore((s) => s.b2bClients);
  const branchList = useAppStore((s) => s.branchList);
  const addB2b = useAppStore((s) => s.addB2b);
  const updateB2b = useAppStore((s) => s.updateB2b);
  const importB2b = useAppStore((s) => s.importB2b);
  const removeB2b = useAppStore((s) => s.removeB2b);
  const readOnly = useAppStore((s) => isReadOnlyRole(s.role));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<B2BClientRecord | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ActiveFilter>("all");
  const [result, setResult] = useState<ResultSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searched = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? "").includes(q)));
  }, [rows, query]);
  const activeCount = searched.filter((r) => r.isActive === true).length;
  const filtered = useMemo(
    () =>
      active === "all" ? searched : searched.filter((r) => (active === "active" ? r.isActive === true : r.isActive !== true)),
    [searched, active],
  );
  const paged = usePaged(filtered);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isSheetFile(file.name)) {
      setResult({ tone: "error", title: "קובץ לא נתמך", line: "יש להעלות קובץ אקסל (xlsx, xls) או CSV", detail: file.name });
      return;
    }
    try {
      const all = await parseSheetFile(file);
      const parsed = parseWorkVehicleSheet(all, columns);
      if (!parsed.length) {
        setResult({ tone: "error", title: "לא נמצאו שורות תקינות", line: `עמודות: ${cols.join(", ")}`, detail: file.name });
        return;
      }
      const { active = 0, added, reactivated, remained_active, deactivated, skipped = 0, duplicates = 0 } = await importB2b(parsed);
      setResult({
        tone: "success",
        title: "המאגר עודכן בהצלחה",
        line: reactivated !== undefined && remained_active !== undefined
          ? `${reactivated} רכבים הוחזרו לפעיל, ${remained_active} נותרו פעילים, ${deactivated} סומנו כלא פעילים`
          : `${active} פעילים, ${deactivated} סומנו כלא פעילים`,
        detail: `${added} רכבים חדשים, ${skipped} שורות ריקות/לא תקינות ו־${duplicates} שורות כפולות דולגו`,
      });
    } catch (error) {
      setResult({ tone: "error", title: "סנכרון הקובץ נכשל", line: error instanceof Error ? error.message : "סנכרון הקובץ נכשל", detail: file.name });
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
  const startEdit = (r: B2BClientRecord) => {
    setEditing(r);
    setForm({ ...empty, ...r });
    setError(null);
    setOpen(true);
  };
  const remove = (r: B2BClientRecord) => {
    removeB2b(r.clientCode, r.standard);
    toast.success("הרשומה נמחקה");
  };
  const cell = (r: B2BClientRecord, key: Key) => (key === "branch" && r.branch ? branchLabel(r.branch) : r[key] || "—");
  const numeric = new Set<Key>(["standard", "clientCode", "balance", "budgetSection", "accountKey"]);

  return (
    <>
      <SettingsCard
        label="מאגר רכב עבודה"
        title="מאגר רכב עבודה"
        sub={<><span className="ds-num">{rows.length.toLocaleString("he-IL")}</span> רשומות</>}
        tools={<>
          <button
            type="button"
            className="ds-btn ds-btn-light"
            onClick={() => void downloadImportTemplate("workVehicles").catch(() => toast.error("הורדת התבנית נכשלה"))}
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            הורדת קובץ לדוגמה
          </button>
          {readOnly ? null : <>
            <button type="button" className="ds-btn ds-btn-primary" onClick={() => inputRef.current?.click()}>
              <UploadCloud className="size-4" aria-hidden />
              העלאת קובץ
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              aria-label="קובץ רכב עבודה"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="ds-btn ds-btn-light"
              onClick={() => {
                setEditing(null);
                setForm(empty);
                setError(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              הוספה
            </button>
          </>}
        </>}
        footer={<Pager {...paged} always />}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-table-line px-[18px] py-3">
          <FilterChips
            label="סינון לפי סטטוס"
            value={active}
            onChange={setActive}
            items={[
              { value: "all", label: "הכל", count: searched.length },
              { value: "active", label: "פעיל", count: activeCount },
              { value: "inactive", label: "לא פעיל", count: searched.length - activeCount },
            ]}
          />
          <SearchField value={query} onChange={setQuery} placeholder="חיפוש תקן, חשבון או לקוח" label="חיפוש במאגר רכב עבודה" />
        </div>

        <DataTable minWidth={1500} caption="מאגר רכב עבודה">
          <thead>
            <tr>
              {cols.map((c) => <th key={c} scope="col">{c}</th>)}
              <th scope="col">סטטוס</th>
              {readOnly ? null : <th scope="col"><span className="sr-only">פעולות</span></th>}
            </tr>
          </thead>
          <tbody>
            {paged.slice.length === 0 ? (
              <EmptyRow colSpan={columns.length + (readOnly ? 1 : 2)}>{rows.length === 0 ? "המאגר ריק" : undefined}</EmptyRow>
            ) : (
              paged.slice.map((r) => (
                <tr
                  key={workVehicleKey(r)}
                  className={r.isActive !== true ? "is-inactive" : undefined}
                  title={r.isActive !== true ? "לא פעיל — לא הופיע בייבוא האחרון" : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key}>
                      {numeric.has(c.key) ? <span className="ds-num">{cell(r, c.key)}</span> : cell(r, c.key)}
                    </td>
                  ))}
                  <td><StatusBadge status={r.isActive === true ? "פעיל" : "לא פעיל"} size="sm" /></td>
                  {readOnly ? null : (
                    <td>
                      <span className="flex gap-1">
                        <button type="button" className="ds-rowact" aria-label={`עריכת ${r.accountName}`} onClick={() => startEdit(r)}>עריכה</button>
                        <button type="button" className="ds-rowact !text-redeemed-fg" aria-label={`מחיקת ${r.accountName}`} onClick={() => remove(r)}>מחיקה</button>
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <MobileCardList
          items={paged.slice}
          keyOf={(r) => workVehicleKey(r)}
          empty={rows.length === 0 ? "המאגר ריק" : "לא נמצאו רשומות התואמות לסינון."}
          render={(r) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="ds-num font-bold text-navy-900">{r.standard || "—"}</span>
                <StatusBadge status={r.isActive === true ? "פעיל" : "לא פעיל"} size="sm" />
              </div>
              <span className="font-semibold text-ink">{r.clientName || "—"}</span>
              <KV label="שם חשבון">{r.accountName || "—"}</KV>
              <KV label="קוד לקוח"><span className="ds-num">{r.clientCode || "—"}</span></KV>
              <KV label="סניף">{r.branch ? branchLabel(r.branch) : "—"}</KV>
              {readOnly ? null : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="ds-btn ds-btn-light" onClick={() => startEdit(r)}>עריכה</button>
                  <button type="button" className="ds-btn ds-btn-light !text-redeemed-fg" onClick={() => remove(r)}>מחיקה</button>
                </div>
              )}
            </>
          )}
        />
      </SettingsCard>

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
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <FormField key={f.key} label={f.label}>
                <Input
                  aria-label={f.label}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </FormField>
            ))}
          </div>
          {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit">{editing ? "שמירת שינויים" : "הוספה"}</Button>
          </div>
        </form>
      </Modal>

      <ResultDialog result={result} onClose={() => setResult(null)} />
    </>
  );
}
