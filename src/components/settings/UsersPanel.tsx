import { useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
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
import { roleLabels, useAppStore, type Role } from "@/store/appStore";

const roleVariant: Record<Role, "brand" | "info" | "purple"> = {
  admin: "brand",
  branch: "info",
  supervisor: "purple",
};

export function UsersPanel() {
  const users = useAppStore((s) => s.users);
  const addUser = useAppStore((s) => s.addUser);
  const removeUser = useAppStore((s) => s.removeUser);
  const branchList = useAppStore((s) => s.branchList);
  const branchNames = branchList.map((b) => b.name);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    name: "",
    phone: "",
    role: "branch" as Role,
    branch: branchNames[0] ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{9}$/.test(form.id)) {
      setError("ת.ז חייבת להכיל 9 ספרות");
      return;
    }
    if (!form.name.trim() || !form.phone.trim()) {
      setError("יש למלא שם וטלפון");
      return;
    }
    if (users.some((u) => u.id === form.id)) {
      setError("משתמש עם ת.ז זו קיים במערכת");
      return;
    }
    setError(null);
    addUser({ ...form, name: form.name.trim(), phone: form.phone.trim() });
    setOpen(false);
    setForm({ id: "", name: "", phone: "", role: "branch", branch: branchNames[0] ?? "" });
    toast.success("המשתמש נוסף בהצלחה");
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-secondary">משתמשי המערכת</h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          הוספת משתמש
        </Button>
      </div>

      <div className="mt-4">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>ת.ז</TableHeaderCell>
              <TableHeaderCell>שם מלא</TableHeaderCell>
              <TableHeaderCell>טלפון</TableHeaderCell>
              <TableHeaderCell>תפקיד</TableHeaderCell>
              <TableHeaderCell>שיוך לסניף</TableHeaderCell>
              <TableHeaderCell>פעולות</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="tabular-nums">{u.id}</TableCell>
                <TableCell className="font-semibold">{u.name}</TableCell>
                <TableCell className="tabular-nums">{u.phone}</TableCell>
                <TableCell>
                  <Badge variant={roleVariant[u.role]} size="md">
                    {roleLabels[u.role]}
                  </Badge>
                </TableCell>
                <TableCell>{u.branch}</TableCell>
                <TableCell>
                  <button
                    onClick={() => {
                      removeUser(u.id);
                      toast.success("המשתמש הוסר");
                    }}
                    aria-label={`מחק את ${u.name}`}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-danger focus-visible:shadow-focus"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="הוספת משתמש חדש">
        <form onSubmit={submit} className="space-y-5">
          <div className="flex items-center gap-3 rounded-lg bg-blue-100 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface text-blue-700">
              <UserPlus className="size-5" />
            </span>
            <p className="text-sm font-semibold text-secondary">
              המשתמש יקבל הרשאות בהתאם לתפקיד ולסניף שייבחרו
            </p>
          </div>

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

          <FormField label="שם מלא">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="שם ושם משפחה"
              aria-label="שם מלא"
            />
          </FormField>

          <FormField label="טלפון">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
              placeholder="050-0000000"
              aria-label="טלפון"
              className="tabular-nums"
            />
          </FormField>

          <FormField label="תפקיד">
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              aria-label="תפקיד"
            >
              {(Object.keys(roleLabels) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="שיוך לסניף">
            <Select
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              aria-label="שיוך לסניף"
            >
              {branchNames.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </FormField>

          {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit">הוספת משתמש</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
