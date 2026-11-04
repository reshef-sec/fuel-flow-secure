import { fuelLabel, fuelOf, type FuelType } from "@/components/fuel/fuel";
import { publicVoucherUrl } from "@/lib/publicUrl";
import { formatIsraelDate } from "@/lib/israelDate";
import { useMemo, useState } from "react";
import { Copy, LockOpen, Search, SquareArrowOutUpRight } from "lucide-react";
import { logActivity } from "@/lib/activityLog";
import { currentActor, type WorkerLink } from "@/store/appStore";
import { unlockWorkerLink } from "@/lib/backend";
import { Pager, usePaged } from "@/components/ui/Pager";
import { DataTable, EmptyRow, KV, MobileCardList, TableCard } from "@/components/ui/DataTable";
import { FilterChips } from "@/components/ui/FilterChips";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LINK_STATUS_FILTERS } from "@/lib/statusDisplay";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { toast } from "sonner";

import { useAppStore, useCurrentUser } from "@/store/appStore";
import { useLearningActive } from "@/components/learning/LearningMode";

/** Employee link; learning-environment links carry ?demo=1 so the public page reads the demo data. */
const linkUrl = (id: string, demo: boolean) =>
  publicVoucherUrl(id, undefined, demo);

export type LinkStatus = (typeof LINK_STATUS_FILTERS)[number];

/** Display status of a worker link: נעול / נחתם / ממתין לחתימה (an expired unsigned link stays ממתין לחתימה). */
export const linkStatusOf = (l: Pick<WorkerLink, "locked" | "signedAt">): LinkStatus =>
  l.locked ? "נעול" : l.signedAt ? "נחתם" : "ממתין לחתימה";

export interface ProducedRow {
  link: WorkerLink;
  status: LinkStatus;
  clients: string;
  fuels: FuelType[];
}

/** Produced links scoped to the viewer's role (unchanged rules), with derived display fields. */
export function useProducedRows(limit?: number): ProducedRow[] {
  const links = useAppStore((s) => s.links);
  const vouchers = useAppStore((s) => s.vouchers);
  const role = useAppStore((s) => s.role);
  const authId = useAppStore((s) => s.authId);
  const me = useCurrentUser();

  return useMemo(() => {
    let list = links;
    if (role === "branch") list = list.filter((l) => l.branch === me?.branch);
    if (role === "supervisor") list = list.filter((l) => l.supervisorId === authId);
    if (limit) list = list.slice(0, limit);
    const bySerial = new Map(vouchers.map((v) => [v.serial, v]));
    return list.map((l) => {
      const own = l.serials.map((s) => bySerial.get(s)).filter((v): v is NonNullable<typeof v> => !!v);
      const fs = [...new Set(own.map((v) => fuelOf(v)))];
      return {
        link: l,
        status: linkStatusOf(l),
        clients: Array.from(new Set(own.map((v) => v.client).filter(Boolean))).join(", "),
        fuels: fs.length ? fs : (["בנזין"] as FuelType[]),
      };
    });
  }, [links, vouchers, role, me?.branch, authId, limit]);
}

function FuelTag({ fuel }: { fuel: FuelType }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-lg border px-2.5 py-[3px] text-[12.5px] font-bold",
        fuel === "סולר" ? "border-[#c9d6ee] bg-[#f2f5fb] text-shell-2" : "border-[#bfe9e0] bg-[#effaf7] text-available-fg",
      )}
    >
      {fuelLabel(fuel)}
    </span>
  );
}

type Filter = "all" | LinkStatus;

/** Produced worker links, scoped to the viewer's role, with copy-again and unlock. */
export function ProducedLinks({ limit, variant = "table" }: { limit?: number; variant?: "table" | "compact" }) {
  const role = useAppStore((s) => s.role);
  const authId = useAppStore((s) => s.authId);
  const rows = useProducedRows(limit);
  const demo = useLearningActive();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const bySearch = useMemo(() => {
    const q = query.trim();
    return q ? rows.filter((r) => (r.link.employeeName ?? "").includes(q) || r.clients.includes(q)) : rows;
  }, [rows, query]);
  const filtered = useMemo(() => (filter === "all" ? bySearch : bySearch.filter((r) => r.status === filter)), [bySearch, filter]);

  const paged = usePaged(filtered);
  const unlockFn = unlockWorkerLink;
  const [busy, setBusy] = useState<string | null>(null);
  const canUnlock = (l: { supervisorId?: string }) => role === "admin" || (!!authId && l.supervisorId === authId);
  async function unlock(id: string) {
    setBusy(id);
    try {
      await unlockFn({ data: { id } });
      useAppStore.setState((s) => ({ links: s.links.map((l) => (l.id === id ? { ...l, locked: false } : l)) }));
      logActivity(currentActor(), "שחרור לינק נעול", `קישור ${id}`);
      toast.success("מונה הניסיונות אופס והלינק פתוח");
    } catch (e) {
      toast.error((e as Error).message || "שחרור הלינק נכשל");
    } finally {
      setBusy(null);
    }
  }

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(linkUrl(id, demo));
      toast.success("הלינק הועתק — ניתן לשלוח שוב לעובד");
    } catch {
      toast.error("ההעתקה נכשלה");
    }
  }

  if (variant === "compact") {
    if (rows.length === 0) return <p className="m-0 border-t border-table-line py-6 text-center text-sm text-slate-600">עדיין לא הופקו שוברים</p>;
    return (
      <div className="flex flex-col">
        {rows.map((r) => (
          <div key={r.link.id} className="flex flex-wrap items-center gap-3 border-t border-table-line py-2.5">
            <div className="flex min-w-[160px] flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-navy-900">{r.link.employeeName ?? "—"}</span>
              <span className="text-[12.5px] text-slate-600">{r.clients || "—"}</span>
            </div>
            <span className="flex flex-wrap gap-1">{r.fuels.map((f) => <FuelTag key={f} fuel={f} />)}</span>
            <span className="ds-num min-w-[70px] font-bold">{r.link.total.toLocaleString("he-IL")} ₪</span>
            <StatusBadge status={r.status} size="sm" />
            <span className="ds-num text-xs text-slate-600">{formatIsraelDate(r.link.createdAt)}</span>
            <button type="button" className="ds-rowact" aria-label={`העתקת הלינק של ${r.link.employeeName ?? "העובד"}`} onClick={() => void copy(r.link.id)}>
              <Copy className="inline size-4" aria-hidden /> העתקה
            </button>
          </div>
        ))}
      </div>
    );
  }

  const chipItems = [
    { value: "all" as Filter, label: "הכל", count: bySearch.length },
    ...LINK_STATUS_FILTERS.map((s) => ({ value: s as Filter, label: s, count: bySearch.filter((r) => r.status === s).length })),
  ];
  const emptyText = rows.length === 0 ? "עדיין לא הופקו שוברים" : "לא נמצאו קישורים התואמים לסינון.";

  const actions = (r: ProducedRow, mobile = false) => {
    const l = r.link;
    // Always offered (signed links too): workers often return to their codes later, and a
    // signed link can still lock after wrong ID/phone attempts. Permission = canUnlock (issuer or admin).
    const showUnlock = true;
    const who = l.employeeName ?? "העובד";
    return (
      <>
        <button type="button" className={mobile ? "ds-btn ds-btn-light" : "ds-rowact"} aria-label={`העתקת הלינק של ${who}`} onClick={() => void copy(l.id)}>
          <Copy className="inline size-4" aria-hidden /> העתקה
        </button>
        <a className={cn(mobile ? "ds-btn ds-btn-light" : "ds-rowact", "no-underline")} aria-label={`פתיחת הלינק של ${who}`} href={linkUrl(l.id, demo)} target="_blank" rel="noopener noreferrer">
          <SquareArrowOutUpRight className="inline size-4" aria-hidden /> פתיחה
        </a>
        {showUnlock ? (
          <button
            type="button"
            aria-label={`שחרור נעילה ואיפוס ניסיונות — ${who}`}
            title={canUnlock(l) ? "שחרור נעילה / איפוס ניסיונות שגויים" : "רק מי שהפיק את השובר או אדמין"}
            disabled={busy === l.id || !canUnlock(l)}
            onClick={() => void unlock(l.id)}
            className={cn(
              mobile ? "ds-btn ds-btn-light col-span-2" : "ds-rowact",
              "disabled:cursor-not-allowed disabled:opacity-40",
              r.status === "נעול" && "text-red-700",
            )}
          >
            <LockOpen className="inline size-4" aria-hidden /> שחרור נעילה
          </button>
        ) : null}
      </>
    );
  };

  return (
    <TableCard
      label="טבלת קישורים שהופקו"
      toolbar={
        <>
          <FilterChips label="סינון לפי סטטוס קישור" items={chipItems} value={filter} onChange={setFilter} />
          <label className="relative block max-[899.98px]:w-full">
            <span className="sr-only">חיפוש לפי שם עובד או לקוח</span>
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" aria-hidden />
            <input
              type="search"
              placeholder="שם עובד או לקוח"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full rounded-control border border-line-strong bg-white pl-3 pr-9 text-[15px] text-navy-900 outline-none focus:shadow-focus-mint min-[900px]:w-[240px]"
            />
          </label>
        </>
      }
      footer={limit ? undefined : <Pager {...paged} always />}
    >
      <DataTable minWidth={1100} maxHeight={580} caption="קישורים שהופקו לעובדים">
        <thead>
          <tr>
            <th scope="col">תאריך</th>
            <th scope="col">עובד</th>
            <th scope="col">לקוחות</th>
            <th scope="col">סכום</th>
            <th scope="col">כרטיסים</th>
            <th scope="col">סוג דלק</th>
            <th scope="col">סטטוס קישור</th>
            <th scope="col">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <EmptyRow colSpan={8}>{emptyText}</EmptyRow>
          ) : (
            paged.slice.map((r) => (
              <tr key={r.link.id}>
                <td><span className="ds-num text-ink-soft">{formatIsraelDate(r.link.createdAt)}</span></td>
                <td className="font-semibold">{r.link.employeeName ?? "—"}</td>
                <td className="text-slate-600">{r.clients || "—"}</td>
                <td><span className="ds-num font-semibold">{r.link.total.toLocaleString("he-IL")} ₪</span></td>
                <td><span className="ds-num text-shell-2">{r.link.serials.length}</span></td>
                <td><span className="flex flex-wrap gap-1">{r.fuels.map((f) => <FuelTag key={f} fuel={f} />)}</span></td>
                <td><StatusBadge status={r.status} /></td>
                <td><div className="flex items-center gap-0.5">{actions(r)}</div></td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      <MobileCardList
        items={filtered.length ? paged.slice : []}
        keyOf={(r) => r.link.id}
        empty={emptyText}
        render={(r) => (
          <>
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-[15px] font-bold">{r.link.employeeName ?? "—"}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {r.fuels.map((f) => <FuelTag key={f} fuel={f} />)}
              <span className="ds-num text-[17px] font-bold">{r.link.total.toLocaleString("he-IL")} ₪</span>
              <span className="ds-num text-[12.5px] text-slate-600">{r.link.serials.length} כרטיסים</span>
            </div>
            <KV label="לקוחות">{r.clients || "—"}</KV>
            <KV label="הופק"><span className="ds-num">{formatIsraelDate(r.link.createdAt)}</span></KV>
            <div className="grid grid-cols-2 gap-2">{actions(r, true)}</div>
          </>
        )}
      />
    </TableCard>
  );
}
