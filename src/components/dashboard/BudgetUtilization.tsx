import { Card } from "@/design-system/delek-1ea111";
import { MAIN_POOL, type Role } from "@/store/appStore";
import { isAvailable, isIssued } from "@/components/dashboard/voucherData";

type V = { branch: string; amount: number; deliveredAt?: string | null; updatedAt: string; status: string };

const tone = (p: number) => (p > 90 ? "bg-danger" : p >= 75 ? "bg-warning" : "bg-success");
const toneText = (p: number) => (p > 90 ? "text-danger" : p >= 75 ? "text-warning" : "text-success");

/** Utilization % = issued in period / (issued in period + still-available branch budget). */
export function BudgetUtilization({ vouchers, since, role, myBranch, periodLabel }: {
  vouchers: V[]; since: string | null; role: Role; myBranch: string; periodLabel: string;
}) {
  const stats = new Map<string, { issued: number; budget: number }>();
  for (const v of vouchers as never as Parameters<typeof isIssued>[0][]) {
    const x = v as unknown as V;
    if (!x.branch || x.branch === MAIN_POOL) continue;
    const s = stats.get(x.branch) ?? { issued: 0, budget: 0 };
    if (isIssued(v)) {
      if (!since || (x.deliveredAt ?? x.updatedAt) >= since) { s.issued += x.amount; s.budget += x.amount; }
    } else if (isAvailable(v)) s.budget += x.amount;
    stats.set(x.branch, s);
  }
  const rows = [...stats.entries()]
    .map(([branch, s]) => ({ branch, pct: s.budget ? Math.round((s.issued / s.budget) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const tot = [...stats.values()].reduce((a, s) => ({ i: a.i + s.issued, b: a.b + s.budget }), { i: 0, b: 0 });
  const avg = tot.b ? Math.round((tot.i / tot.b) * 100) : 0;

  if (role === "supervisor") return null;

  return (
    <Card padding="lg" className="mt-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg font-extrabold text-secondary">ניצול תקציב סניפי</p>
        <p className="text-sm text-muted-foreground">{periodLabel} · ממוצע ארצי <span className={`font-bold ${toneText(avg)}`}>{avg}%</span></p>
      </div>

      {role === "admin" ? (
        rows.length === 0 ? <p className="text-sm text-muted-foreground">אין נתונים לתקופה</p> : (
          <div className="relative">
            <div className="flex h-56 items-end gap-3 overflow-x-auto border-b border-border pb-1">
              {rows.map((r) => (
                <div key={r.branch} className="flex h-full min-w-12 flex-1 flex-col items-center justify-end gap-1">
                  <span className={`text-xs font-bold ${toneText(r.pct)}`}>{r.pct}%</span>
                  <div className={`w-full max-w-14 rounded-t-md ${tone(r.pct)}`} style={{ height: `${Math.max(2, Math.min(100, r.pct)) * 0.85}%` }} />
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-secondary" style={{ bottom: `calc(${Math.min(100, avg) * 0.85}% * 224 / 228 + 4px)` }}>
              <span className="absolute -top-5 start-0 bg-surface px-1 text-xs font-semibold text-secondary">ממוצע ארצי {avg}%</span>
            </div>
            <div className="mt-2 flex gap-3 overflow-x-auto">
              {rows.map((r) => <span key={r.branch} className="min-w-12 flex-1 truncate text-center text-xs text-muted-foreground">{r.branch}</span>)}
            </div>
          </div>
        )
      ) : (
        (() => {
          const mine = rows.find((r) => r.branch.trim() === myBranch.trim())?.pct ?? 0;
          return (
            <div className="space-y-4">
              {[{ l: `סניף ${myBranch || "—"}`, p: mine }, { l: "ממוצע ארצי", p: avg }].map((x) => (
                <div key={x.l}>
                  <div className="mb-1 flex justify-between text-sm font-semibold"><span>{x.l}</span><span className={toneText(x.p)}>{x.p}%</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-surface-muted">
                    <div className={`h-full rounded-full ${tone(x.p)}`} style={{ width: `${Math.min(100, x.p)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      )}
    </Card>
  );
}
