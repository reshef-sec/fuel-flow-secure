import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/design-system/delek-1ea111";
import { MAIN_POOL, type Role } from "@/store/appStore";
import { isAvailable, isIssued, mainBranch } from "@/components/dashboard/voucherData";

type V = { branch: string; amount: number; deliveredAt?: string | null; updatedAt: string };
type Slice = { name: string; value: number; branches: string[]; details?: { name: string; value: number }[] };

const OTHERS = "אחרים";
const TOP = 5;
const PALETTE = ["var(--color-primary)", "var(--color-accent)", "var(--color-secondary)", "var(--color-warning)", "var(--color-mint-300)", "var(--color-muted-foreground)"];
const USED = "var(--color-danger)";
const LEFT = "var(--color-success)";

const ils = (n: number) => `${n.toLocaleString("he-IL")} ₪`;

function Tip({ active, payload, total }: { active?: boolean; payload?: { name: string; value: number; payload?: Slice }[]; total: number }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-md">
      <p className="font-bold text-secondary">{p.name}</p>
      <p>{p.payload?.details ? "סה\"כ: " : ""}{ils(p.value)} · {total ? Math.round((p.value / total) * 100) : 0}%</p>
      {p.payload?.details ? (
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto border-t border-border pt-1 text-xs">
          {p.payload.details.map((d) => <li key={d.name} className="flex justify-between gap-4"><span>{d.name}</span><span className="tabular-nums">{ils(d.value)}</span></li>)}
        </ul>
      ) : null}
    </div>
  );
}

/** Budget per branch in the period = issued in period + still-available. */
export function BudgetUtilization({ vouchers, since, role, myBranch, periodLabel }: {
  vouchers: V[]; since: string | null; role: Role; myBranch: string; periodLabel: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (role === "supervisor") return null;

  const stats = new Map<string, { issued: number; budget: number }>();
  for (const v of vouchers) {
    const b = mainBranch(v.branch);
    if (!b || b === MAIN_POOL) continue;
    const s = stats.get(b) ?? { issued: 0, budget: 0 };
    const vv = v as never;
    if (isIssued(vv)) {
      if (!since || (v.deliveredAt ?? v.updatedAt) >= since) { s.issued += v.amount; s.budget += v.amount; }
    } else if (isAvailable(vv)) s.budget += v.amount;
    stats.set(b, s);
  }

  const sorted = [...stats.entries()].filter(([, s]) => s.budget > 0).sort((a, b) => b[1].budget - a[1].budget);
  const slices: Slice[] = sorted.slice(0, TOP).map(([name, s]) => ({ name, value: s.budget, branches: [name] }));
  const rest = sorted.slice(TOP);
  if (rest.length) slices.push({ name: OTHERS, value: rest.reduce((t, [, s]) => t + s.budget, 0), branches: rest.map(([n]) => n), details: rest.map(([name, s]) => ({ name, value: s.budget })) });
  const allocTotal = slices.reduce((t, s) => t + s.value, 0);

  const scope = role === "branch" ? [mainBranch(myBranch)] : selected ? slices.find((s) => s.name === selected)?.branches ?? null : null;
  const pick = scope ? [...stats.entries()].filter(([n]) => scope.includes(n)).map(([, s]) => s) : [...stats.values()];
  const used = pick.reduce((t, s) => t + s.issued, 0);
  const left = Math.max(0, pick.reduce((t, s) => t + s.budget, 0) - used);
  const poolTotal = used + left;
  const poolData = [{ name: "נוצל", value: used }, { name: "יתרה", value: left }];
  const poolTitle = role === "branch" ? `סניף ${myBranch || "—"}` : selected ?? "מאגר ארצי";

  const pool = (
    <Card padding="lg" className="flex-1">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-display text-lg font-extrabold text-secondary">ניצול תקציב</p>
        <p className="text-sm text-muted-foreground">{poolTitle} · {periodLabel}</p>
      </div>
      {poolTotal === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">אין נתונים לתקופה</p> : (
        <div className="relative h-64">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={poolData} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="90%" paddingAngle={2} isAnimationActive>
                <Cell fill={USED} /><Cell fill={LEFT} />
              </Pie>
              <Tooltip content={<Tip total={poolTotal} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div><p className="font-display text-2xl font-extrabold text-secondary">{Math.round((used / poolTotal) * 100)}%</p><p className="text-xs text-muted-foreground">נוצל</p></div>
          </div>
        </div>
      )}
      <div className="mt-2 flex justify-center gap-4 text-sm">
        {poolData.map((d, i) => <span key={d.name} className="flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ background: i ? LEFT : USED }} />{d.name} · {ils(d.value)}</span>)}
      </div>
    </Card>
  );

  if (role === "branch") return <div className="mt-5">{pool}</div>;

  return (
    <div className="mt-5 flex flex-col gap-5 lg:flex-row">
      <Card padding="lg" className="flex-1">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="font-display text-lg font-extrabold text-secondary">התפלגות תקציבים</p>
          <p className="text-sm text-muted-foreground">{selected ? "לחצו שוב לאיפוס" : "לחצו על סניף לסינון"}</p>
        </div>
        {allocTotal === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">אין נתונים לתקופה</p> : (
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="90%" paddingAngle={2}
                  onClick={(d: { name?: string }) => setSelected((cur) => (cur === d.name ? null : d.name ?? null))} className="cursor-pointer">
                  {slices.map((s, i) => (
                    <Cell key={s.name} fill={PALETTE[i % PALETTE.length]} opacity={selected && selected !== s.name ? 0.35 : 1} stroke={selected === s.name ? "var(--color-secondary)" : undefined} strokeWidth={selected === s.name ? 3 : 1} />
                  ))}
                </Pie>
                <Tooltip content={<Tip total={allocTotal} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
          {slices.map((s, i) => (
            <button key={s.name} onClick={() => setSelected((c) => (c === s.name ? null : s.name))} className={`flex items-center gap-1.5 ${selected && selected !== s.name ? "opacity-50" : ""}`}>
              <span className="size-3 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{s.name}
            </button>
          ))}
        </div>
      </Card>
      {pool}
    </div>
  );
}
