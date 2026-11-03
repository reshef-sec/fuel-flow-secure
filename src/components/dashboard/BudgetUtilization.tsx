import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { MAIN_POOL, type Role } from "@/store/appStore";
import { isAvailable, isIssued, mainBranch } from "@/components/dashboard/voucherData";
import { branchLabel } from "@/lib/branchLabels";

type V = { branch: string; amount: number; deliveredAt?: string | null; updatedAt: string };
type Slice = { name: string; value: number; branches: string[]; details?: { name: string; value: number }[] };

const DIRECT = "הונפק ישירות ממאגר מרכזי";
const PALETTE = ["var(--color-primary)", "var(--color-accent)", "var(--color-secondary)", "var(--color-warning)", "var(--color-mint-300)", "var(--color-muted-foreground)"];
const USED = "var(--color-danger)";

const ils = (n: number) => `${n.toLocaleString("he-IL")} ₪`;

function Tip({ active, payload, total }: { active?: boolean; payload?: { name: string; value: number; payload?: Slice }[]; total: number }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-md">
      <p className="font-bold text-secondary">{branchLabel(p.name)}</p>
      <p>{p.payload?.details ? "סה\"כ: " : ""}{ils(p.value)} · {total ? Math.round((p.value / total) * 100) : 0}%</p>
      {p.payload?.details ? (
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto border-t border-border pt-1 text-xs">
          {p.payload.details.map((d) => <li key={d.name} className="flex justify-between gap-4"><span>{branchLabel(d.name)}</span><span className="tabular-nums">{ils(d.value)}</span></li>)}
        </ul>
      ) : null}
    </div>
  );
}

const UNALLOCATED = "יתרה לא מוקצית בסניף";
const ISSUED = "שוברים שהונפקו";

/** Branch available budget split by supervisor, plus the manager's unallocated part. */
export function SupervisorDistribution({ vouchers, issued }: { vouchers: { amount: number; supervisor?: string }[]; issued: number }) {
  const map = new Map<string, number>([[ISSUED, issued]]);
  for (const v of vouchers) {
    const k = v.supervisor?.trim() ? `יתרת מפקח ${v.supervisor.trim()}` : UNALLOCATED;
    map.set(k, (map.get(k) ?? 0) + v.amount);
  }
  const data: Slice[] = [...map.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value, branches: [name] }));
  const total = data.reduce((t, s) => t + s.value, 0);
  const color = (s: Slice, i: number) => (s.name === UNALLOCATED ? "var(--color-muted-foreground)" : s.name === ISSUED ? USED : PALETTE[i % (PALETTE.length - 1)]);
  return (
    <article className="ds-card p-[22px]">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[17px] font-bold text-navy-900">התפלגות תקציב פנימית</h2>
        <p className="m-0 text-[13px] text-slate-600">סך תקציב הסניף · <span className="ds-num">{ils(total)}</span></p>
      </div>
      {total === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">אין נתונים</p> : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-48 w-full sm:w-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="90%" paddingAngle={2}>
                  {data.map((s, i) => <Cell key={s.name} fill={color(s, i)} />)}
                </Pie>
                <Tooltip content={<Tip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-1 text-sm">
            {data.map((s, i) => (
              <li key={s.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ background: color(s, i) }} />{s.name}</span>
                <span className="tabular-nums">{ils(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/** Budget per branch in the period = issued in period + still-available. */
export function BudgetUtilization({ vouchers, since, role, periodLabel }: {
  vouchers: V[]; since: string | null; role: Role; myBranch: string; periodLabel: string;
}) {
  // Branch managers and supervisors have their own views; this card is organisation-wide.
  if (role === "supervisor" || role === "branch") return null;

  const stats = new Map<string, { issued: number; budget: number }>();
  for (const v of vouchers) {
    const vv = v as never;
    const raw = mainBranch(v.branch);
    const central = !raw || raw === MAIN_POOL;
    // Unissued central stock is not branch budget; vouchers issued straight from it still count.
    if (central && !isIssued(vv)) continue;
    const b = central ? DIRECT : raw;
    const s = stats.get(b) ?? { issued: 0, budget: 0 };
    if (isIssued(vv)) {
      if (!since || (v.deliveredAt ?? v.updatedAt) >= since) { s.issued += v.amount; s.budget += v.amount; }
    } else if (isAvailable(vv)) s.budget += v.amount;
    stats.set(b, s);
  }

  const sorted = [...stats.entries()].filter(([, s]) => s.budget > 0).sort((a, b) => b[1].budget - a[1].budget);
  const used = sorted.reduce((t, [, s]) => t + s.issued, 0);
  const total = sorted.reduce((t, [, s]) => t + s.budget, 0);
  const left = Math.max(0, total - used);
  const pctOf = (part: number, whole: number) => (whole ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0);

  return (
    <article className="ds-card flex flex-col gap-4 p-[22px]">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex flex-col gap-[3px]">
          <h2 className="m-0 text-[17px] font-bold text-navy-900">ניצול תקציב לפי סניף</h2>
          <span className="text-[12.5px] text-slate-600">הונפק מתוך התקציב · {periodLabel}</span>
        </div>
        <Link to="/allocations" className="inline-flex min-h-11 items-center gap-1 px-1 text-[13px] font-semibold text-primary no-underline hover:text-blue-700">
          להקצאות
          <ChevronLeft className="size-3.5" aria-hidden />
        </Link>
      </div>
      {sorted.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-600">אין נתונים לתקופה</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-table-head px-3.5 py-2.5 text-[13px] text-slate-600">
            <span>מאגר ארצי · נוצל <span className="ds-num font-bold text-navy-900">{pctOf(used, used + left)}%</span></span>
            <span>
              <span className="ds-num font-semibold text-navy-900">{ils(used)}</span> הונפק · <span className="ds-num font-semibold text-navy-900">{ils(left)}</span> יתרה
            </span>
          </div>
          <ul className="ds-scroll m-0 flex max-h-[340px] list-none flex-col gap-3.5 p-0 pe-1">
            {sorted.map(([name, s]) => {
              const pct = pctOf(s.issued, s.budget);
              const high = pct >= 90;
              return (
                <li key={name} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2 text-[13.5px]">
                    <span className="font-semibold">{branchLabel(name)}</span>
                    <span className="text-slate-600">
                      <span className="ds-num">{s.issued.toLocaleString("he-IL")} / {ils(s.budget)}</span> ·{" "}
                      <span className={`ds-num font-semibold ${high ? "text-pending-fg" : "text-navy-900"}`}>{pct}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`ניצול ${branchLabel(name)}`}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: high ? "var(--color-pending)" : "linear-gradient(90deg, var(--color-primary), var(--color-mint-500))" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-4 border-t border-table-line pt-1.5 text-[12.5px] text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-mint-500))" }} />תקין</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-pending" />90% ומעלה — קרוב למיצוי</span>
          </div>
        </>
      )}
    </article>
  );
}
