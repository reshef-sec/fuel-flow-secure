import { FuelBadge } from "@/components/fuel/fuel";
import { useEffect, useMemo, useState } from "react";

import { Badge, Select } from "@/design-system/delek-1ea111";
import { api } from "@/lib/apiClient";
import { DataTable, EmptyRow, KV, MobileCardList } from "@/components/ui/DataTable";
import { Pager, usePaged } from "@/components/ui/Pager";
import { formatIsraelDate } from "@/lib/israelDate";
import { SearchField, SettingsCard } from "./shared";

interface AuditRecord {
  id: string;
  user: string;
  role: string;
  action: string;
  target: string;
  at: string;
  ip: string;
}

const formatAt = (iso: string) => formatIsraelDate(iso, true);

const actionVariant = (action: string) =>
  action.includes("חסימת")
    ? ("danger" as const)
    : action.includes("מימוש")
      ? ("success" as const)
      : action.includes("הקצאת") || action.includes("הנפקת")
        ? ("purple" as const)
        : ("info" as const);

const fuelOf = (target: string) =>
  /סולר/.test(target ?? "") ? <FuelBadge fuel="סולר" /> : /בנזין/.test(target ?? "") ? <FuelBadge fuel="בנזין" /> : "—";

export function AuditPanel() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [auditLog, setAuditLog] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .from("activity_log")
      .select("id, created_at, user_name, role, action, target, ip_address")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else
          setAuditLog(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((data ?? []) as Record<string, any>[]).map((r) => ({
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
  const paged = usePaged(rows);
  const emptyText = loading ? "טוען רשומות…" : error ? `טעינת היומן נכשלה: ${error}` : "לא נמצאו רשומות מתאימות";

  return (
    <SettingsCard
      label="יומן פעילות"
      title="יומן פעילות"
      sub="מי ביצע, מה, מתי ומאיזו כתובת IP."
      tools={<>
        <SearchField value={query} onChange={setQuery} placeholder="משתמש, פעולה או יעד" label="חיפוש ביומן הפעילות" />
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="סינון לפי תפקיד"
          className="h-11 w-full rounded-control min-[900px]:w-44"
        >
          <option value="all">כל התפקידים</option>
          <option value="אדמין מרכזי">אדמין מרכזי</option>
          <option value="מנהל סניף">מנהל סניף</option>
          <option value="מפקח">מפקח</option>
          <option value="צופה">צופה</option>
        </Select>
      </>}
      footer={<Pager {...paged} always />}
    >
      <DataTable minWidth={1000} caption="יומן פעילות">
        <thead>
          <tr>
            <th scope="col">משתמש</th>
            <th scope="col">תפקיד</th>
            <th scope="col">פעולה</th>
            <th scope="col">יעד</th>
            <th scope="col">סוג דלק</th>
            <th scope="col">תאריך ושעה</th>
            <th scope="col">כתובת IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={7}>{emptyText}</EmptyRow>
          ) : (
            paged.slice.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold text-navy-900">{r.user}</td>
                <td>{r.role}</td>
                <td>
                  <Badge variant={actionVariant(r.action)} size="md">
                    {r.action}
                  </Badge>
                </td>
                <td>{r.target}</td>
                <td>{fuelOf(r.target)}</td>
                <td><span className="ds-num">{r.at}</span></td>
                <td><span className="ds-num" dir="ltr">{r.ip}</span></td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      <MobileCardList
        items={paged.slice}
        keyOf={(r) => r.id}
        empty={emptyText}
        render={(r) => (
          <>
            <div className="flex items-center justify-between gap-2">
              <Badge variant={actionVariant(r.action)} size="md">{r.action}</Badge>
              <span className="ds-num text-[12.5px] text-slate-600">{r.at}</span>
            </div>
            <span className="text-[14px] text-ink">{r.target}</span>
            <KV label="משתמש">{r.user} · {r.role}</KV>
            <KV label="כתובת IP"><span className="ds-num" dir="ltr">{r.ip}</span></KV>
          </>
        )}
      />
    </SettingsCard>
  );
}
