import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Plus, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button, FormField, Input } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { DataTable, EmptyRow, KV, MobileCardList } from "@/components/ui/DataTable";
import { FilterChips } from "@/components/ui/FilterChips";
import { Pager, usePaged } from "@/components/ui/Pager";
import { ResultDialog, type ResultSummary } from "@/components/ui/ResultDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { isSheetFile, parseSheetFile, stripHeader } from "@/lib/parseSheet";
import { mapPrivateVehicleRows, privateVehicleHeaders } from "@/lib/importTemplates";
import { downloadImportTemplate } from "@/lib/excel";
import { isReadOnlyRole, useAppStore, type ClientRecord } from "@/store/appStore";
import { privateVehicleKey } from "@/lib/privateVehicles";
import { SearchField, SettingsCard } from "./shared";

const empty = { clientId: "", clientName: "", siteId: "", siteName: "", standard: "" };

type ActiveFilter = "all" | "active" | "inactive";

export function ClientsPanel() {
  const clients = useAppStore((s) => s.nonB2bClients);
  const addClient = useAppStore((s) => s.addClient);
  const updateClient = useAppStore((s) => s.updateClient);
  const importClients = useAppStore((s) => s.importClients);
  const removeClient = useAppStore((s) => s.removeClient);
  const readOnly = useAppStore((s) => isReadOnlyRole(s.role));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ clientId: string; siteId: string } | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ActiveFilter>("all");
  const [result, setResult] = useState<ResultSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searched = useMemo(() => {
    const q = query.trim();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.clientId, c.clientName, c.siteId, c.siteName, c.standard ?? ""].some((v) => v.includes(q)),
    );
  }, [clients, query]);
  const activeCount = searched.filter((c) => c.isActive === true).length;
  const filtered = useMemo(
    () =>
      active === "all" ? searched : searched.filter((c) => (active === "active" ? c.isActive === true : c.isActive !== true)),
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
      const raw = stripHeader(await parseSheetFile(file), "לקוח");
      const rows = mapPrivateVehicleRows(raw);
      if (rows.length === 0) {
        setResult({ tone: "error", title: "לא נמצאו שורות תקינות", line: "עמודות: מס' לקוח, שם לקוח, מספר אתר, שם אתר, תקן", detail: file.name });
        return;
      }
      const { added, updated, deactivated, duplicates = 0, blanks = 0 } = await importClients(rows);
      paged.setPage(0);
      setResult({
        tone: "success",
        title: "המאגר עודכן בהצלחה",
        line: `נוספו ${added} אתרים, ${updated} עודכנו, ${deactivated} סומנו כלא פעילים`,
        detail: `${duplicates} כפולים ו־${blanks} שורות ריקות דולגו`,
      });
    } catch (error) {
      setResult({ tone: "error", title: "סנכרון הקובץ נכשל", line: error instanceof Error ? error.message : "סנכרון הקובץ נכשל", detail: file.name });
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.clientId.trim() ||
      !form.clientName.trim() ||
      !form.siteId.trim() ||
      !form.siteName.trim() ||
      !form.standard.trim()
    ) {
      setError("יש למלא את כל השדות, כולל תקן");
      return;
    }
    const payload = {
      clientId: form.clientId.trim(),
      clientName: form.clientName.trim(),
      siteId: form.siteId.trim(),
      siteName: form.siteName.trim(),
      standard: form.standard.trim(),
    };
    const clash = clients.some(
      (c) =>
        c.clientId === payload.clientId &&
        c.siteId === payload.siteId &&
        !(editing && c.clientId === editing.clientId && c.siteId === editing.siteId),
    );
    if (clash) {
      setError("שילוב לקוח ואתר זה קיים כבר");
      return;
    }
    setError(null);
    if (editing) {
      updateClient(editing.clientId, editing.siteId, payload);
      toast.success("פרטי האתר עודכנו");
    } else {
      addClient(payload);
      toast.success("הלקוח נוסף בהצלחה");
    }
    setForm(empty);
    setEditing(null);
    setOpen(false);
  }

  const startEdit = (c: ClientRecord) => {
    setEditing({ clientId: c.clientId, siteId: c.siteId });
    setForm({
      clientId: c.clientId,
      clientName: c.clientName,
      siteId: c.siteId,
      siteName: c.siteName,
      standard: c.standard ?? "",
    });
    setError(null);
    setOpen(true);
  };
  const remove = (c: ClientRecord) => {
    removeClient(c.clientId, c.siteId);
    toast.success("האתר נמחק");
  };
  const status = (c: ClientRecord) => (c.isActive === true ? "פעיל" : "לא פעיל");

  return (
    <>
      <SettingsCard
        label="מאגר רכב פרטי"
        title="מאגר רכב פרטי"
        sub={<><span className="ds-num">{clients.length.toLocaleString("he-IL")}</span> אתרים</>}
        tools={<>
          <button
            type="button"
            className="ds-btn ds-btn-light"
            onClick={() => {
              void downloadImportTemplate("privateVehicles")
                .then(() => toast.success("תבנית הלקוחות הורדה"))
                .catch(() => toast.error("הורדת התבנית נכשלה"));
            }}
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
              aria-label="בחירת קובץ לקוחות"
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
          <SearchField value={query} onChange={setQuery} placeholder="חיפוש לקוח, אתר או תקן" label="חיפוש לקוחות ואתרים" />
        </div>

        <DataTable minWidth={860} caption="מאגר רכב פרטי">
          <thead>
            <tr>
              {/* A–E exactly as the import file: מס' לקוח, שם לקוח, מספר אתר, שם אתר, תקן */}
              {privateVehicleHeaders.map((h) => <th key={h} scope="col">{h}</th>)}
              <th scope="col">סטטוס</th>
              {readOnly ? null : <th scope="col"><span className="sr-only">פעולות</span></th>}
            </tr>
          </thead>
          <tbody>
            {paged.slice.length === 0 ? (
              <EmptyRow colSpan={readOnly ? 6 : 7}>{clients.length === 0 ? "המאגר ריק" : undefined}</EmptyRow>
            ) : (
              paged.slice.map((c) => (
                <tr
                  key={privateVehicleKey(c)}
                  className={c.isActive !== true ? "is-inactive" : undefined}
                  title={c.isActive !== true ? "לא פעיל — לא הופיע בייבוא האחרון" : undefined}
                >
                  <td><span className="ds-num font-semibold">{c.clientId}</span></td>
                  <td>{c.clientName}</td>
                  <td><span className="ds-num">{c.siteId}</span></td>
                  <td>{c.siteName}</td>
                  <td><span className="ds-num">{c.standard || "—"}</span></td>
                  <td><StatusBadge status={status(c)} size="sm" /></td>
                  {readOnly ? null : (
                    <td>
                      <span className="flex gap-1">
                        <button type="button" className="ds-rowact" aria-label={`עריכת ${c.siteName}`} onClick={() => startEdit(c)}>עריכה</button>
                        <button type="button" className="ds-rowact !text-redeemed-fg" aria-label={`מחיקת ${c.siteName}`} onClick={() => remove(c)}>מחיקה</button>
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
          keyOf={(c) => privateVehicleKey(c)}
          empty={clients.length === 0 ? "המאגר ריק" : "לא נמצאו רשומות התואמות לסינון."}
          render={(c) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="ds-num font-bold text-navy-900">{c.clientId}</span>
                <StatusBadge status={status(c)} size="sm" />
              </div>
              <span className="font-semibold text-ink">{c.clientName}</span>
              <KV label="אתר">{c.siteName} · <span className="ds-num">{c.siteId}</span></KV>
              <KV label="תקן"><span className="ds-num">{c.standard || "—"}</span></KV>
              {readOnly ? null : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="ds-btn ds-btn-light" onClick={() => startEdit(c)}>עריכה</button>
                  <button type="button" className="ds-btn ds-btn-light !text-redeemed-fg" onClick={() => remove(c)}>מחיקה</button>
                </div>
              )}
            </>
          )}
        />
      </SettingsCard>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "עריכת לקוח ואתר" : "הוספת לקוח ואתר"}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
          <FormField label="תקן">
            <Input
              value={form.standard}
              onChange={(e) => setForm({ ...form, standard: e.target.value })}
              aria-label="תקן"
            />
          </FormField>

          {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
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
