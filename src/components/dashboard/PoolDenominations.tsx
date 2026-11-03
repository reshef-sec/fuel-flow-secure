import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { FUEL_TYPES, FuelBadge, type FuelType } from "@/components/fuel/fuel";
import type { CentralDenomination, CentralInventorySummary } from "@/lib/centralInventorySummary";
import { poolDenominations } from "@/lib/poolDenominations";

/** Face values always shown per fuel (client rule): petrol 100/500, diesel 50/100/500. */
const SHOWN: Record<FuelType, number[]> = { "בנזין": [100, 500], "סולר": [50, 100, 500] };
const RULE: Record<FuelType, string> = { "בנזין": "כפולות של 100 ₪", "סולר": "כפולות של 50 ₪" };

/**
 * Cards fixed at the client's face values (missing ones show 0), plus any other value that
 * poolDenominations still lists as visible — data is never hidden.
 */
function cardsFor(visible: CentralDenomination[], fuel: FuelType) {
  const count = new Map(visible.map((r) => [r.amount, r.count]));
  const extra = visible.map((r) => r.amount).filter((a) => !SHOWN[fuel].includes(a));
  return [...SHOWN[fuel], ...extra].sort((a, b) => a - b).map((amount) => ({ amount, count: count.get(amount) ?? 0 }));
}

const ils = (n: number) => n.toLocaleString("he-IL");

/** Count of available central-pool cards per fuel type and face value. */
export function PoolDenominations({ summary, error }: { summary: CentralInventorySummary | null; error?: string | null }) {
  const rows = summary?.denominations;
  return (
    <article className="ds-card flex flex-col gap-3.5 p-[22px]">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex flex-col gap-[3px]">
          <h2 className="m-0 text-[17px] font-bold text-navy-900">פירוט מאגר לפי ערך</h2>
          <span className="text-[12.5px] text-slate-600">כרטיסים זמינים במאגר המרכזי, לפי סוג דלק וערך נקוב</span>
        </div>
        <Link to="/vouchers" className="inline-flex min-h-11 items-center gap-1 px-1 text-[13px] font-semibold text-primary no-underline hover:text-blue-700">
          למלאי המלא
          <ChevronLeft className="size-3.5" aria-hidden />
        </Link>
      </div>
      {!rows ? (
        <p className="text-sm text-slate-600">{error ?? "טוען פירוט מלאי…"}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">אין כרטיסים זמינים במאגר המרכזי</p>
      ) : (
        FUEL_TYPES.map((f) => {
          const { visible, unexpectedTotal } = poolDenominations(rows, f);
          const cards = cardsFor(visible, f);
          const totalCards = cards.reduce((t, c) => t + c.count, 0);
          const totalValue = cards.reduce((t, c) => t + c.count * c.amount, 0);
          const maxSub = Math.max(1, ...cards.map((c) => c.count * c.amount));
          return (
            <div key={f} className="flex flex-col gap-3 rounded-[14px] border border-table-line bg-table-head p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FuelBadge fuel={f} />
                  <span className="text-xs text-slate-600">{RULE[f]}</span>
                </div>
                <span className="text-[13px] text-slate-600">
                  <span className="ds-num font-bold text-navy-900">{ils(totalCards)}</span> כרטיסים ·{" "}
                  <span className="ds-num font-bold text-navy-900">{ils(totalValue)} ₪</span>
                </span>
              </div>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(86px,1fr))]">
                {cards.map((c) => (
                  <div key={c.amount} className="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface px-2.5 pb-3 pt-2.5 text-center">
                    <span className="ds-num text-[12.5px] font-semibold text-slate-600">{ils(c.amount)} ₪</span>
                    <span className="ds-num text-[22px] font-semibold text-navy-900">{ils(c.count)}</span>
                    <span className="text-[11.5px] text-slate-600">= <span className="ds-num">{ils(c.count * c.amount)}</span> ₪</span>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(((c.count * c.amount) / maxSub) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {unexpectedTotal > 0 ? (
                <p className="m-0 rounded-lg bg-redeemed-bg px-3 py-2 text-xs font-semibold text-redeemed-fg" role="status">
                  נמצאו במלאי ערכי סולר שאינם 50, 100 או 500 ₪, בסך {unexpectedTotal.toLocaleString("he-IL")} ₪; נכללים ביתרה ומצריכים בדיקה.
                </p>
              ) : null}
            </div>
          );
        })
      )}
    </article>
  );
}
