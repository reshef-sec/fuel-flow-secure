import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { supabase } from "@/lib/supabaseClient";

interface AuditRecord {
  id: string;
  user: string;
  role: string;
  action: string;
  target: string;
  at: string;
  ip: string;
}

const formatAt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const actionVariant = (action: string) =>
  action.includes("חסימת")
    ? ("danger" as const)
    : action.includes("מימוש")
      ? ("success" as const)
      : action.includes("הקצאת") || action.includes("הנפקת")
        ? ("purple" as const)
        : ("info" as const);

export function AuditPanel() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [auditLog, setAuditLog] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("activity_logs")
      .select("id, created_at, user_name, role, action, target, ip_address")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else
          setAuditLog(
            (data ?? []).map((r) => ({
              id: String(r.id),
              user: String(r.user_name ?? ""),
              role: String(r.role ?? ""),
              action: String(r.action ?? ""),
              target: r.target ?? "—",
              at: formatAt(String(r.created_at)),
              ip: r.ip_address ?? "—",
            })),
          );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim();
    return auditLog.filter(
      (r) =>
        (role === "all" || r.role === role) &&
        (!q || r.user.includes(q) || r.action.includes(q) || r.target.includes(q)),
    );
  }, [auditLog, query, role]);

  return (
    <Card padding="lg">
      <CardHeader>
        <CardTitle>יומן פעילות</CardTitle>
      </CardHeader>
      <p className="text-sm text-muted-foreground">
        תיעוד מלא של פעולות המשתמשים במערכת: מי ביצע, מה בוצע, מתי ומאיזו כתובת IP.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי משתמש, פעולה או יעד"
            aria-label="חיפוש ביומן הפעילות"
            className="pe-9"
          />
        </div>
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="סינון לפי תפקיד"
          className="w-auto"
        >
          <option value="all">כל התפקידים</option>
          <option value="אדמין מרכזי">אדמין מרכזי</option>
          <option value="מנהל סניף">מנהל סניף</option>
          <option value="מפקח">מפקח</option>
        </Select>
      </div>

      <div className="mt-5 overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>משתמש</TableHeaderCell>
              <TableHeaderCell>תפקיד</TableHeaderCell>
              <TableHeaderCell>פעולה</TableHeaderCell>
              <TableHeaderCell>יעד</TableHeaderCell>
              <TableHeaderCell>תאריך ושעה</TableHeaderCell>
              <TableHeaderCell>כתובת IP</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell className="py-8 text-center text-sm text-muted-foreground">
                  {loading
                    ? "טוען רשומות…"
                    : error
                      ? `טעינת היומן נכשלה: ${error}`
                      : "לא נמצאו רשומות מתאימות"}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold text-secondary">{r.user}</TableCell>
                  <TableCell>{r.role}</TableCell>
                  <TableCell>
                    <Badge variant={actionVariant(r.action)} size="md">
                      {r.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.target}</TableCell>
                  <TableCell className="tabular-nums">{r.at}</TableCell>
                  <TableCell className="tabular-nums" dir="ltr">
                    {r.ip}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
