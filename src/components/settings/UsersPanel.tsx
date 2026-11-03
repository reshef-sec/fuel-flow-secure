import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Plus, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Checkbox,
  FormField,
  Input,
  Select,
} from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { DataTable, EmptyRow, KV, MobileCardList } from "@/components/ui/DataTable";
import { ResultDialog, type ResultSummary } from "@/components/ui/ResultDialog";
import { deleteAccount, resetAccountPassword, syncAccount } from "@/lib/backend";
import { isSheetFile, parseSheetFile, stripHeader } from "@/lib/parseSheet";
import { fullName, isReadOnlyRole, roleLabels, useAppStore, type Role, type UserRecord } from "@/store/appStore";
import { branchLabel } from "@/lib/branchLabels";
import { parseUserRows } from "@/lib/importTemplates";
import { downloadImportTemplate } from "@/lib/excel";
import { SearchField, SettingsCard } from "./shared";

const roleVariant: Record<Role, "brand" | "info" | "purple" | "muted"> = {
  admin: "brand",
  branch: "info",
  supervisor: "purple",
  viewer: "muted",
};

function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge variant={roleVariant[role]} size="md" className="whitespace-nowrap font-bold">
      {roleLabels[role]}
    </Badge>
  );
}

/** "רשאי להקים דרישה" — checkbox + explicit yes/no pill so the state reads at a glance. */
function CanRequestToggle({ user, disabled, onChange }: { user: UserRecord; disabled: boolean; onChange: (v: boolean) => void }) {
  const on = Boolean(user.canRequest);
  return (
    <label className={cn("inline-flex min-h-11 items-center gap-2", disabled ? "cursor-default" : "cursor-pointer")}>
      <input
        type="checkbox"
        className="size-[18px] accent-[var(--color-blue-500)]"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={`רשאי להקים דרישה - ${user.lastName} ${user.firstName}`}
      />
      <span
        className={cn(
          "rounded-pill px-2.5 py-0.5 text-xs font-bold",
          on ? "bg-available-bg text-available-fg" : "bg-neutral-bg text-neutral-fg",
        )}
      >
        {on ? "רשאי" : "לא רשאי"}
      </span>
    </label>
  );
}

export function UsersPanel() {
  const users = useAppStore((s) => s.users);
  const addUser = useAppStore((s) => s.addUser);
  const updateUser = useAppStore((s) => s.updateUser);
  const removeUser = useAppStore((s) => s.removeUser);
  const branchList = useAppStore((s) => s.branchList);
  const branchNames = branchList.map((b) => b.name);
  const importUsers = useAppStore((s) => s.importUsers);
  const setUserCanRequest = useAppStore((s) => s.setUserCanRequest);
  const role = useAppStore((s) => s.role);
  const isAdmin = role === "admin";
  const readOnly = isReadOnlyRole(role);
  const fileRef = useRef<HTMLInputElement>(null);
  const resetFn = resetAccountPassword;
  const syncFn = syncAccount;
  const deleteFn = deleteAccount;
  const accountData = (u: UserRecord) => ({
    phone: u.phone,
    nationalId: u.id,
    fullName: `${u.firstName} ${u.lastName}`.trim(),
    branch: u.branch,
    role: u.role,
  });

  async function resetPassword(u: UserRecord) {
    try {
      await resetFn({ data: accountData(u) });
      updateUser(u.id, { requiresPasswordChange: true });
      toast.success("סיסמת המשתמש אופסה בהצלחה לתעודת הזהות שלו");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "איפוס הסיסמה נכשל");
    }
  }

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [result, setResult] = useState<ResultSummary | null>(null);
  const [form, setForm] = useState({
    branch: branchNames[0] ?? "",
    id: "",
    lastName: "",
    firstName: "",
    role: "supervisor" as Role,
    title: "",
    phone: "",
    canRequest: false,
  });
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!isSheetFile(file.name)) {
      setResult({ tone: "error", title: "קובץ לא נתמך", line: "יש להעלות קובץ אקסל (xlsx/xls) או CSV", detail: file.name });
      return;
    }
    try {
      const raw = stripHeader(await parseSheetFile(file), "ת.ז");
      // Row parsing lives in src/lib/importTemplates.ts (moved unchanged; covered by excel.test.ts).
      const parsed: UserRecord[] = parseUserRows(raw);
      if (!parsed.length) {
        setResult({ tone: "error", title: "לא נמצאו שורות תקינות בקובץ", detail: file.name });
        return;
      }
      const { added, skipped } = importUsers(parsed);
      setResult({ tone: "success", title: "ייבוא המשתמשים הושלם", line: `נוספו ${added} משתמשים, ${skipped} דולגו (ת.ז קיימת)`, detail: file.name });
    } catch {
      setResult({ tone: "error", title: "שגיאה בקריאת הקובץ", detail: file.name });
    }
  }

  const rows = useMemo(() => {
    const q = query.trim();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return [u.id, u.lastName, u.firstName, u.title, u.phone, u.branch].some((v) =>
        v.includes(q),
      );
    });
  }, [users, query, roleFilter]);
  const requesters = users.filter((u) => u.canRequest).length;

  const blankForm = () => ({
    branch: branchNames[0] ?? "",
    id: "",
    lastName: "",
    firstName: "",
    role: "supervisor" as Role,
    title: "",
    phone: "",
    canRequest: false,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{9}$/.test(form.id)) {
      setError("ת.ז חייבת להכיל 9 ספרות");
      return;
    }
    if (!form.lastName.trim() || !form.firstName.trim()) {
      setError("יש למלא שם משפחה ושם פרטי");
      return;
    }
    if (!form.title.trim() || !form.phone.trim()) {
      setError("יש למלא תפקיד וטלפון נייד");
      return;
    }
    if (users.some((u) => u.id === form.id && u.id !== editingId)) {
      setError("משתמש עם ת.ז זו קיים במערכת");
      return;
    }
    setError(null);
    const payload: UserRecord = {
      ...form,
      lastName: form.lastName.trim(),
      firstName: form.firstName.trim(),
      title: form.title.trim(),
      phone: form.phone.trim(),
    };
    if (editingId) {
      updateUser(editingId, payload);
      toast.success("פרטי המשתמש עודכנו");
    } else {
      addUser({ ...payload, requiresPasswordChange: true });
      toast.success("המשתמש נוסף בהצלחה — סיסמה ראשונית: ת.ז");
    }
    syncFn({ data: accountData(payload) }).catch((err) =>
      toast.error(err instanceof Error ? `חשבון הכניסה לא עודכן: ${err.message}` : "חשבון הכניסה לא עודכן"),
    );
    setOpen(false);
    setEditingId(null);
    setForm(blankForm());
  }

  const startEdit = (u: UserRecord) => {
    setEditingId(u.id);
    setError(null);
    setForm({
      branch: u.branch,
      id: u.id,
      lastName: u.lastName,
      firstName: u.firstName,
      role: u.role,
      title: u.title,
      phone: u.phone,
      canRequest: Boolean(u.canRequest),
    });
    setOpen(true);
  };
  const remove = (u: UserRecord) => {
    deleteFn({ data: { nationalId: u.id } }).catch(() => undefined);
    removeUser(u.id);
    toast.success("המשתמש הוסר");
  };

  return (
    <>
      <SettingsCard
        label="משתמשי המערכת"
        title={<>משתמשי המערכת <span className="ms-1 text-sm font-semibold text-slate-600"><span className="ds-num">{rows.length}</span> מתוך <span className="ds-num">{users.length}</span></span></>}
        sub={<><span className="ds-num font-bold text-navy-900">{requesters}</span> רשאים להקים דרישה (יכולים לקבל הקצאות)</>}
        tools={<>
          <SearchField value={query} onChange={setQuery} placeholder="ת.ז, שם, תפקיד או סניף" label="חיפוש משתמשים" />
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
            aria-label="סינון לפי הרשאה"
            className="h-11 w-full rounded-control min-[900px]:w-40"
          >
            <option value="all">כל ההרשאות</option>
            {(Object.keys(roleLabels) as Role[]).map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </Select>
          {readOnly ? null : <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              aria-label="קובץ משתמשים"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFile(file);
              }}
            />
            <span className="inline-flex flex-wrap items-center gap-1">
              <button type="button" className="ds-btn ds-btn-light" onClick={() => fileRef.current?.click()}>
                <UploadCloud className="size-4" aria-hidden />
                ייבוא מאקסל
              </button>
              <button
                type="button"
                className="ds-rowact inline-flex min-h-11 items-center gap-1.5"
                onClick={() => void downloadImportTemplate("users").catch(() => toast.error("הורדת התבנית נכשלה"))}
              >
                <FileSpreadsheet className="size-4" aria-hidden />
                הורדת קובץ לדוגמה
              </button>
            </span>
            <button
              type="button"
              className="ds-btn ds-btn-primary"
              onClick={() => {
                setEditingId(null);
                setError(null);
                setForm(blankForm());
                setOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              הוספת משתמש
            </button>
          </>}
        </>}
      >
        <DataTable minWidth={1100} caption="משתמשי המערכת">
          <thead>
            <tr>
              <th scope="col">ת.ז</th>
              <th scope="col">שם</th>
              <th scope="col">הרשאה</th>
              <th scope="col">רשאי להקים דרישה</th>
              <th scope="col">תפקיד</th>
              <th scope="col">סניף</th>
              <th scope="col">נייד</th>
              {readOnly ? null : <th scope="col"><span className="sr-only">פעולות</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={readOnly ? 7 : 8}>לא נמצאו משתמשים מתאימים</EmptyRow>
            ) : (
              rows.map((u) => (
                <tr key={u.id}>
                  <td><span className="ds-num">{u.id}</span></td>
                  <td className="font-semibold text-navy-900">{fullName(u)}</td>
                  <td><RoleBadge role={u.role} /></td>
                  <td><CanRequestToggle user={u} disabled={!isAdmin} onChange={(v) => setUserCanRequest(u.id, v)} /></td>
                  <td>{u.title}</td>
                  <td>{u.branch ? branchLabel(u.branch) : "—"}</td>
                  <td><span className="ds-num" dir="ltr">{u.phone}</span></td>
                  {readOnly ? null : (
                    <td>
                      <span className="flex gap-1">
                        {isAdmin ? (
                          <button type="button" className="ds-rowact" aria-label={`איפוס סיסמה ל${u.lastName} ${u.firstName}`} onClick={() => void resetPassword(u)}>
                            איפוס סיסמה
                          </button>
                        ) : null}
                        <button type="button" className="ds-rowact" aria-label={`עריכת ${u.lastName} ${u.firstName}`} onClick={() => startEdit(u)}>
                          עריכה
                        </button>
                        <button type="button" className="ds-rowact !text-redeemed-fg" aria-label={`מחיקת ${u.lastName} ${u.firstName}`} onClick={() => remove(u)}>
                          מחיקה
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <MobileCardList
          items={rows}
          keyOf={(u) => u.id}
          empty="לא נמצאו משתמשים מתאימים"
          render={(u) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-navy-900">{fullName(u)}</span>
                <RoleBadge role={u.role} />
              </div>
              <KV label="ת.ז"><span className="ds-num">{u.id}</span></KV>
              <KV label="תפקיד · סניף">{u.title} · {u.branch ? branchLabel(u.branch) : "—"}</KV>
              <KV label="נייד"><span className="ds-num" dir="ltr">{u.phone}</span></KV>
              <div className="flex items-center justify-between gap-2 border-t border-table-line pt-1 text-[13.5px]">
                <span className="font-semibold text-ink">רשאי להקים דרישה</span>
                <CanRequestToggle user={u} disabled={!isAdmin} onChange={(v) => setUserCanRequest(u.id, v)} />
              </div>
              {readOnly ? null : (
                <div className={cn("grid gap-2", isAdmin ? "grid-cols-3" : "grid-cols-2")}>
                  {isAdmin ? <button type="button" className="ds-btn ds-btn-light !px-2" onClick={() => void resetPassword(u)}>איפוס סיסמה</button> : null}
                  <button type="button" className="ds-btn ds-btn-light !px-2" onClick={() => startEdit(u)}>עריכה</button>
                  <button type="button" className="ds-btn ds-btn-light !px-2 !text-redeemed-fg" onClick={() => remove(u)}>מחיקה</button>
                </div>
              )}
            </>
          )}
        />
      </SettingsCard>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "עריכת משתמש" : "הוספת משתמש חדש"}
        description="ההרשאות נקבעות לפי ההרשאה והסניף שנבחרו."
      >
        <form onSubmit={submit} className="space-y-4">
          <FormField label="סניף">
            <Select
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              aria-label="סניף"
            >
              {branchNames.map((b) => (
                <option key={b} value={b}>
                  {branchLabel(b)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="ת.ז">
            <Input
              value={form.id}
              onChange={(e) =>
                setForm({ ...form, id: e.target.value.replace(/\D/g, "").slice(0, 9) })
              }
              inputMode="numeric"
              placeholder="123456789"
              aria-label="ת.ז"
              className="tabular-nums"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="משפחה">
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="שם משפחה"
                aria-label="משפחה"
              />
            </FormField>
            <FormField label="פרטי">
              <Input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="שם פרטי"
                aria-label="פרטי"
              />
            </FormField>
          </div>

          <FormField label="הרשאה">
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              aria-label="הרשאה"
            >
              {(Object.keys(roleLabels) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="תפקיד">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="לדוגמה: מנהל סניף, מפקח ירושלים"
              aria-label="תפקיד"
            />
          </FormField>

          <FormField label="נייד">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
              dir="ltr"
              placeholder="050-0000000"
              aria-label="נייד"
              className="tabular-nums"
            />
          </FormField>

          <div className="rounded-control border border-line-strong bg-table-head p-3">
            <Checkbox
              checked={form.canRequest}
              disabled={!isAdmin}
              onChange={(e) => setForm({ ...form, canRequest: e.target.checked })}
              label={<span className="font-semibold">רשאי להקים דרישה</span>}
            />
            {!isAdmin ? (
              <p className="mt-1 text-xs text-muted-foreground">
                רק אדמין מרכזי רשאי לעדכן הרשאה זו
              </p>
            ) : null}
          </div>
          {editingId ? null : <p className="text-xs text-slate-600">סיסמה ראשונית: ת.ז</p>}

          {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit">{editingId ? "שמירת שינויים" : "הוספת משתמש"}</Button>
          </div>
        </form>
      </Modal>

      <ResultDialog result={result} onClose={() => setResult(null)} />
    </>
  );
}
