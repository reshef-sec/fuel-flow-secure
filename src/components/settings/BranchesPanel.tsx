import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  FormField,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { useAppStore, type BranchRecord } from "@/store/appStore";

const empty = { name: "", manager: "", city: "" };

export function BranchesPanel() {
  const branchList = useAppStore((s) => s.branchList);
  const addBranch = useAppStore((s) => s.addBranch);
  const updateBranch = useAppStore((s) => s.updateBranch);
  const removeBranch = useAppStore((s) => s.removeBranch);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BranchRecord | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? { name: editing.name, manager: editing.manager, city: editing.city } : empty);
    setError(null);
  }, [open, editing]);

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
    if (editing) {
      updateBranch(editing.id, { name, manager: form.manager.trim(), city: form.city.trim() });
      toast.success("פרטי הסניף עודכנו");
    } else {
      addBranch({
        id: `b-${Date.now()}`,
        name,
        manager: form.manager.trim(),
        city: form.city.trim(),
      });
      toast.success("הסניף נוסף בהצלחה");
    }
    setOpen(false);
    setEditing(null);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-secondary">ניהול סניפים</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          הוספת סניף
        </Button>
      </div>

      <div className="mt-4">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>שם סניף</TableHeaderCell>
              <TableHeaderCell>מנהל הסניף</TableHeaderCell>
              <TableHeaderCell>עיר</TableHeaderCell>
              <TableHeaderCell>פעולות</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {branchList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  לא הוגדרו סניפים
                </TableCell>
              </TableRow>
            ) : (
              branchList.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-semibold">{b.name}</TableCell>
                  <TableCell>{b.manager || "—"}</TableCell>
                  <TableCell>{b.city || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`ערוך ${b.name}`}
                        onClick={() => {
                          setEditing(b);
                          setOpen(true);
                        }}
                        className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-primary focus-visible:shadow-focus"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        aria-label={`מחק ${b.name}`}
                        onClick={() => {
                          removeBranch(b.id);
                          toast.success("הסניף נמחק");
                        }}
                        className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-danger focus-visible:shadow-focus"
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
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "עריכת סניף" : "הוספת סניף חדש"}
      >
        <form onSubmit={submit} className="space-y-5">
          <FormField label="שם סניף">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="סניף שרון"
              aria-label="שם סניף"
            />
          </FormField>
          <FormField label="מנהל הסניף">
            <Input
              value={form.manager}
              onChange={(e) => setForm({ ...form, manager: e.target.value })}
              placeholder="שם ושם משפחה"
              aria-label="מנהל הסניף"
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

          {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit">{editing ? "שמירת שינויים" : "הוספת סניף"}</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
