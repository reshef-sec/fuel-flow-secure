import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button, FormField, Input, Select } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { DataTable, EmptyRow, KV, MobileCardList } from "@/components/ui/DataTable";
import { fullName, isReadOnlyRole, useAppStore, type BranchRecord } from "@/store/appStore";
import { branchLabel } from "@/lib/branchLabels";
import { SettingsCard } from "./shared";

const empty = { name: "", manager: "", city: "" };

/**
 * Branch manager = a user with role "branch", chosen from the users list.
 * Stored in the same `manager` text field as before, as fullName(u) ("משפחה פרטי") — the same
 * representation used for user labels across the app. One branch per manager.
 */
export function BranchesPanel() {
  const branchList = useAppStore((s) => s.branchList);
  const users = useAppStore((s) => s.users);
  const addBranch = useAppStore((s) => s.addBranch);
  const updateBranch = useAppStore((s) => s.updateBranch);
  const removeBranch = useAppStore((s) => s.removeBranch);
  const readOnly = useAppStore((s) => isReadOnlyRole(s.role));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BranchRecord | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? { name: editing.name, manager: editing.manager, city: editing.city } : empty);
    setError(null);
  }, [open, editing]);

  const managers = useMemo(
    () => users.filter((u) => u.role === "branch").map((u) => ({ name: fullName(u), branch: u.branch, id: u.id })),
    [users],
  );
  /** manager name → branch that already uses it (excluding the branch being edited). */
  const takenBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of branchList) if (b.manager && b.id !== editing?.id) m.set(b.manager.trim(), b.name);
    return m;
  }, [branchList, editing]);
  const userCount = (b: BranchRecord) => users.filter((u) => u.branch === b.name).length;
  const legacyManager = form.manager && !managers.some((m) => m.name === form.manager) ? form.manager : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("יש להזין שם סניף");
      return;
    }
    if (branchList.some((b) => b.name === name && b.id !== editing?.id)) {
      setError("סניף בשם זה קיים כבר");
      return;
    }
    const manager = form.manager.trim();
    // Only a newly chosen manager is checked, so legacy data never blocks editing other fields.
    if (manager && manager !== (editing?.manager ?? "").trim() && takenBy.has(manager)) {
      setError(`${manager} כבר משויך/ת כמנהל/ת ${branchLabel(takenBy.get(manager) ?? "")}`);
      return;
    }
    if (editing) {
      updateBranch(editing.id, { name, manager, city: form.city.trim() });
      toast.success("פרטי הסניף עודכנו");
    } else {
      addBranch({
        id: `b-${Date.now()}`,
        name,
        manager,
        city: form.city.trim(),
      });
      toast.success("הסניף נוסף בהצלחה");
    }
    setOpen(false);
    setEditing(null);
  }

  const startEdit = (b: BranchRecord) => {
    setEditing(b);
    setOpen(true);
  };
  const remove = (b: BranchRecord) => {
    removeBranch(b.id);
    toast.success("הסניף נמחק");
  };
  const managerCell = (b: BranchRecord) =>
    b.manager ? <span className="font-semibold text-ink">{b.manager}</span> : <span className="text-slate-500">לא שויך מנהל</span>;

  return (
    <>
      <SettingsCard
        label="סניפים"
        title="סניפים"
        sub={<><span className="ds-num">{branchList.length}</span> סניפים · מנהל סניף נבחר מתוך המשתמשים בהרשאת מנהל סניף</>}
        tools={readOnly ? null : (
          <button
            type="button"
            className="ds-btn ds-btn-primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            הוספת סניף
          </button>
        )}
      >
        <DataTable minWidth={640} caption="סניפים">
          <thead>
            <tr>
              <th scope="col">שם סניף</th>
              <th scope="col">מנהל סניף</th>
              <th scope="col">עיר</th>
              <th scope="col">משתמשים</th>
              {readOnly ? null : <th scope="col"><span className="sr-only">פעולות</span></th>}
            </tr>
          </thead>
          <tbody>
            {branchList.length === 0 ? (
              <EmptyRow colSpan={readOnly ? 4 : 5}>לא הוגדרו סניפים</EmptyRow>
            ) : (
              branchList.map((b) => (
                <tr key={b.id}>
                  <td className="font-semibold text-navy-900">{branchLabel(b.name)}</td>
                  <td>{managerCell(b)}</td>
                  <td>{b.city || "—"}</td>
                  <td><span className="ds-num">{userCount(b)}</span></td>
                  {readOnly ? null : (
                    <td>
                      <span className="flex gap-1">
                        <button type="button" className="ds-rowact" aria-label={`עריכת ${branchLabel(b.name)}`} onClick={() => startEdit(b)}>
                          {b.manager ? "עריכה" : "שיוך מנהל"}
                        </button>
                        <button type="button" className="ds-rowact !text-redeemed-fg" aria-label={`מחיקת ${branchLabel(b.name)}`} onClick={() => remove(b)}>
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
          items={branchList}
          keyOf={(b) => b.id}
          empty="לא הוגדרו סניפים"
          render={(b) => (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-navy-900">{branchLabel(b.name)}</span>
                <span className="text-[13px] text-slate-600">{b.city || "—"} · <span className="ds-num">{userCount(b)}</span> משתמשים</span>
              </div>
              <KV label="מנהל סניף">{managerCell(b)}</KV>
              {readOnly ? null : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="ds-btn ds-btn-light" onClick={() => startEdit(b)}>{b.manager ? "עריכה" : "שיוך מנהל"}</button>
                  <button type="button" className="ds-btn ds-btn-light !text-redeemed-fg" onClick={() => remove(b)}>מחיקה</button>
                </div>
              )}
            </>
          )}
        />
      </SettingsCard>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "עריכת סניף" : "הוספת סניף חדש"}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="שם סניף">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="סניף שרון"
                aria-label="שם סניף"
              />
            </FormField>
            <FormField label="עיר">
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="נתניה"
                aria-label="עיר"
              />
            </FormField>
          </div>
          <FormField
            label="מנהל הסניף"
            hint={managers.length === 0 ? "אין משתמשים בהרשאת מנהל סניף — יש להוסיף משתמש בלשונית משתמשים." : "כל מנהל סניף משויך לסניף אחד בלבד."}
          >
            <Select
              value={form.manager}
              onChange={(e) => setForm({ ...form, manager: e.target.value })}
              aria-label="מנהל הסניף"
              className="h-11"
            >
              <option value="">ללא מנהל</option>
              {legacyManager ? <option value={legacyManager}>{legacyManager} (לא ברשימת המשתמשים)</option> : null}
              {managers.map((m) => {
                const taken = takenBy.get(m.name);
                return (
                  <option key={m.id} value={m.name} disabled={Boolean(taken)}>
                    {m.name}
                    {m.branch ? ` · ${branchLabel(m.branch)}` : ""}
                    {taken ? ` — מנהל/ת ${branchLabel(taken)}` : ""}
                  </option>
                );
              })}
            </Select>
          </FormField>

          {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit">{editing ? "שמירת שינויים" : "הוספת סניף"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
