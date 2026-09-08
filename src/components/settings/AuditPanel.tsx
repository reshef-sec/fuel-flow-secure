import { useMemo, useState } from "react";
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

interface AuditRecord {
  id: string;
  user: string;
  role: string;
  action: string;
  target: string;
  at: string;
  ip: string;
}

const auditLog: AuditRecord[] = [
  { id: "a1", user: "דנה כהן", role: "אדמין מרכזי", action: "הקצאת שוברים", target: "סניף צפון · 1,200 ₪", at: "2026-09-08 09:14", ip: "10.0.4.21" },
  { id: "a2", user: "אורי לוי", role: "מנהל סניף", action: "הנפקת שובר לעובד", target: "מפקח דן · שובר 481233", at: "2026-09-08 08:52", ip: "10.0.7.14" },
  { id: "a3", user: "דנה כהן", role: "אדמין מרכזי", action: "ייבוא שוברים", target: "120 שוברים מקובץ אקסל", at: "2026-09-07 17:31", ip: "10.0.4.21" },
  { id: "a4", user: "מפקח דן", role: "מפקח", action: "מימוש שובר", target: "שובר 552901", at: "2026-09-07 15:05", ip: "77.126.8.44" },
  { id: "a5", user: "נועה ברק", role: "מנהל סניף", action: "עדכון סניף", target: "סניף ירושלים", at: "2026-09-07 11:47", ip: "10.0.9.3" },
  { id: "a6", user: "דנה כהן", role: "אדמין מרכזי", action: "הוספת משתמש", target: "מפקח אורי", at: "2026-09-06 16:20", ip: "10.0.4.21" },
  { id: "a7", user: "רון אלמוג", role: "מנהל סניף", action: "חסימת שובר", target: "שובר 330118", at: "2026-09-06 12:02", ip: "10.0.5.88" },
  { id: "a8", user: "דן מזרחי", role: "מנהל סניף", action: "כניסה למערכת", target: "—", at: "2026-09-06 07:58", ip: "10.0.6.19" },
];

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

  const rows = useMemo(() => {
    const q = query.trim();
    return auditLog.filter(
      (r) =>
        (role === "all" || r.role === role) &&
        (!q || r.user.includes(q) || r.action.includes(q) || r.target.includes(q)),
    );
  }, [query, role]);

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
                  לא נמצאו רשומות מתאימות
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
