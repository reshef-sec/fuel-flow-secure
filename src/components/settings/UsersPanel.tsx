import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Checkbox,
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
import { isSheetFile, parseSheetFile, stripHeader } from "@/lib/parseSheet";
import { roleLabels, useAppStore, type Role, type UserRecord } from "@/store/appStore";

const roleFromLabel = (value: string): Role => {
  const v = value.trim();
  if (v === "אדמין" || v === "admin" || v.includes("אדמין")) return "admin";
  if (v === "מנהל סניף" || v === "branch" || v.includes("סניף")) return "branch";
  return "supervisor";
};

const truthy = (value: string) =>
  ["כן", "true", "1", "v", "yes", "✓"].includes(value.trim().toLowerCase());

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
  const importUsers = useAppStore((s) => s.importUsers);
  const setUserCanRequest = useAppStore((s) => s.setUserCanRequest);
  const role = useAppStore((s) => s.role);
  const isAdmin = role === "admin";
  const fileRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [open, setOpen] = useState(false);
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
      toast.error("יש להעלות קובץ אקסל (xlsx/xls) או CSV");
      return;
    }
    try {
      const raw = stripHeader(await parseSheetFile(file), "ת.ז");
      const parsed: UserRecord[] = [];
      for (const r of raw) {
        const [branch = "", id = "", lastName = "", firstName = "", roleCell = "", title = "", phone = "", canReq = ""] = r;
        const cleanId = id.replace(/\D/g, "");
        if (cleanId.length !== 9 || !lastName.trim()) continue;
        parsed.push({
          branch: branch.trim(),
          id: cleanId,
          lastName: lastName.trim(),
          firstName: firstName.trim(),
          role: roleFromLabel(roleCell),
          title: title.trim(),
          phone: phone.trim(),
          canRequest: truthy(canReq),
        });
      }
      if (!parsed.length) {
        toast.error("לא נמצאו שורות תקינות בקובץ");
        return;
      }
      const { added, skipped } = importUsers(parsed);
      toast.success(`נוספו ${added} משתמשים, ${skipped} דולגו (ת.ז קיימת)`);
    } catch {
      toast.error("שגיאה בקריאת הקובץ");
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
    if (users.some((u) => u.id === form.id)) {
      setError("משתמש עם ת.ז זו קיים במערכת");
      return;
    }
    setError(null);
    addUser({
      ...form,
      lastName: form.lastName.trim(),
      firstName: form.firstName.trim(),
      title: form.title.trim(),
      phone: form.phone.trim(),
    });
    setOpen(false);
    setForm({
      branch: branchNames[0] ?? "",
      id: "",
      lastName: "",
      firstName: "",
      role: "supervisor",
      title: "",
      phone: "",
      canRequest: false,
    });
    toast.success("המשתמש נוסף בהצלחה");
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-secondary">
          משתמשי המערכת
          <span className="ms-2 text-sm font-semibold text-muted-foreground">
            {rows.length} מתוך {users.length}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי ת.ז, שם, תפקיד או סניף"
              aria-label="חיפוש משתמשים"
              className="w-64 pe-9"
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
            aria-label="סינון לפי הרשאה"
            className="w-40"
          >
            <option value="all">כל ההרשאות</option>
            {(Object.keys(roleLabels) as Role[]).map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </Select>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            הוספת משתמש
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>סניף</TableHeaderCell>
              <TableHeaderCell>ת.ז</TableHeaderCell>
              <TableHeaderCell>משפחה</TableHeaderCell>
              <TableHeaderCell>פרטי</TableHeaderCell>
              <TableHeaderCell>הרשאה</TableHeaderCell>
              <TableHeaderCell>תפקיד</TableHeaderCell>
              <TableHeaderCell>נייד</TableHeaderCell>
              <TableHeaderCell>פעולות</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.branch}</TableCell>
                <TableCell className="tabular-nums">{u.id}</TableCell>
                <TableCell className="font-semibold">{u.lastName}</TableCell>
                <TableCell>{u.firstName}</TableCell>
                <TableCell>
                  <Badge variant={roleVariant[u.role]} size="md">
                    {roleLabels[u.role]}
                  </Badge>
                </TableCell>
                <TableCell>{u.title}</TableCell>
                <TableCell className="tabular-nums" dir="ltr">
                  {u.phone}
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => {
                      removeUser(u.id);
                      toast.success("המשתמש הוסר");
                    }}
                    aria-label={`מחק את ${u.lastName} ${u.firstName}`}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-danger focus-visible:shadow-focus"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  לא נמצאו משתמשים מתאימים
                </TableCell>
              </TableRow>
            ) : null}
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
              המשתמש יקבל הרשאות בהתאם להרשאה ולסניף שייבחרו
            </p>
          </div>

          <FormField label="סניף">
            <Select
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              aria-label="סניף"
            >
              {branchNames.map((b) => (
                <option key={b} value={b}>
                  {b}
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
              placeholder="050-0000000"
              aria-label="נייד"
              className="tabular-nums"
            />
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
