import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Ticket } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { NoAccess } from "@/components/layout/NoAccess";
import { PageHero } from "@/components/ui/PageHero";
import { DataTable, EmptyRow, KV, MobileCardList, TableCard } from "@/components/ui/DataTable";
import { ResultDialog, type ResultSummary } from "@/components/ui/ResultDialog";
import { AdminAllocationForm } from "@/components/allocations/AdminAllocationForm";
import { PoolSummary } from "@/components/allocations/AllocationForm";
import { adminRecipients, recipientRoleText, recipientTarget } from "@/components/allocations/allocationRecipients";
import { fuelOf, type FuelType } from "@/components/fuel/fuel";
import { fullName, isReadOnlyRole, seesAllData, useAppStore } from "@/store/appStore";
import { useCentralInventorySummary } from "@/lib/useCentralInventorySummary";
import { useLiveInventory } from "@/lib/useLiveInventory";
import { centralPoolOf } from "@/lib/centralInventory";
import { issuancePool } from "@/lib/issuanceStock";
import { branchLabel } from "@/lib/branchLabels";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

export const Route = createFileRoute("/allocations")({
  head: () => ({
    meta: [
      { title: "הקצאות לסניפים | רשף ביטחון" },
      {
        name: "description",
        content: "מלאי ויתרות שוברים בכל סניף והקצאת שוברים למפקחי הסניף.",
      },
      { property: "og:title", content: "הקצאות לסניפים | רשף ביטחון" },
      { property: "og:description", content: "יתרות סניפים והקצאת שוברים למפקחים." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AllocationsPage,
});

const fmt = (n: number) => n.toLocaleString("he-IL");

interface BalanceRow {
  key: string;
  name: string;
  role: string;
  roleTone: "branch" | "request" | "plain";
  branch: string;
  petrol: number;
  diesel: number;
}

function AllocationsPage() {
  const branchList = useAppStore((s) => s.branchList);
  const users = useAppStore((s) => s.users);
  const vouchers = useAppStore((s) => s.vouchers);
  const role = useAppStore((s) => s.role);
  // The read-only viewer sees the same stock overview, without allocation actions.
  const adminView = seesAllData(role);
  const readOnly = isReadOnlyRole(role);
  const { summary, error: inventoryError, refresh } = useCentralInventorySummary(adminView);
  const stockReady = useLiveInventory(adminView);
  const [result, setResult] = useState<ResultSummary | null>(null);

  const pools = useMemo(() => ({ "בנזין": centralPoolOf(vouchers, "בנזין"), "סולר": centralPoolOf(vouchers, "סולר") }), [vouchers]);
  const totals = summary ? { "בנזין": summary.gasoline_amount, "סולר": summary.diesel_amount } : null;

  const rows = useMemo<BalanceRow[]>(() => {
    const sumFuel = (list: { amount: number; fuelType?: FuelType }[], f: FuelType) =>
      list.filter((v) => fuelOf(v) === f).reduce((t, v) => t + v.amount, 0);
    const recipients = adminRecipients(users);
    const out: BalanceRow[] = recipients.map((u) => {
      const t = recipientTarget(u);
      const pool = issuancePool(vouchers, t.supervisor
        ? { role: "supervisor", branch: t.branch, supervisorName: t.supervisor }
        : { role: "branch", branch: t.branch });
      return {
        key: u.id,
        name: fullName(u),
        role: recipientRoleText(u),
        roleTone: u.role === "branch" ? "branch" : u.canRequest ? "request" : "plain",
        branch: branchLabel(u.branch),
        petrol: sumFuel(pool, "בנזין"),
        diesel: sumFuel(pool, "סולר"),
      };
    });
    // Branches with no eligible recipient still show their stock (never hide data).
    const covered = new Set(recipients.filter((u) => !recipientTarget(u).supervisor).map((u) => branchLabel(u.branch)));
    for (const b of branchList) {
      const label = branchLabel(b.name);
      if (covered.has(label)) continue;
      covered.add(label);
      const pool = issuancePool(vouchers, { role: "branch", branch: b.name });
      out.push({ key: `branch-${b.id}`, name: b.manager || "—", role: "סניף", roleTone: "plain", branch: label, petrol: sumFuel(pool, "בנזין"), diesel: sumFuel(pool, "סולר") });
    }
    return out;
  }, [users, vouchers, branchList]);
  const tableTotal = rows.reduce((t, r) => t + r.petrol + r.diesel, 0);

  if (!adminView) return <NoAccess title="הקצאות לסניפים" />;

  return (
    <InternalLayout title="הקצאות לסניפים">
      <PageHero
        eyebrow="ניהול הקצאות"
        title="הקצאות לסניפים"
        subtitle={readOnly ? "יתרות המאגר המרכזי והסניפים." : "הקצאה מהמאגר המרכזי למנהלי סניפים ולמורשי דרישה."}
        actions={
          <Link to="/vouchers" className="ds-btn ds-btn-glass">
            <Ticket className="size-4" aria-hidden />
            מלאי שוברים
          </Link>
        }
      />

      <div className={cn("grid items-start gap-[18px]", !readOnly && "min-[1100px]:grid-cols-[minmax(0,1fr)_320px]")}>
        {readOnly ? null : (
          <section aria-labelledby="alloc-form-title" className="ds-card flex min-w-0 flex-col gap-[18px] px-6 py-[22px] max-[899.98px]:px-4">
            <h2 id="alloc-form-title" className="m-0 text-lg font-extrabold text-navy-900">הקצאה חדשה</h2>
            <AdminAllocationForm
              active={adminView && !readOnly}
              summary={summary}
              inventoryError={inventoryError}
              refresh={refresh}
              stockReady={stockReady}
              onAllocated={refresh}
              onDone={setResult}
              idPrefix="alloc-page"
            />
          </section>
        )}
        <PoolSummary title="מאגר מרכזי" totals={totals} pools={pools} />
      </div>
      {!summary && inventoryError ? <p role="alert" className="m-0 text-sm font-semibold text-red-700">{inventoryError}</p> : null}

      <TableCard
        label="יתרות לפי סניף"
        toolbar={
          <>
            <h2 className="m-0 text-[17px] font-bold text-navy-900">יתרות לפי סניף</h2>
            <span className="text-[13px] text-slate-600">
              סה״כ יתרות: <span className="ds-num font-bold text-navy-900">{fmt(tableTotal)} ₪</span>
            </span>
          </>
        }
      >
        <DataTable minWidth={760} caption="יתרות מקבלי הקצאה לפי סניף">
          <thead>
            <tr>
              <th scope="col">מקבל</th>
              <th scope="col">תפקיד</th>
              <th scope="col">סניף</th>
              <th scope="col">בנזין 95</th>
              <th scope="col">סולר</th>
              <th scope="col">סה״כ יתרה</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>לא הוגדרו סניפים או מקבלי הקצאה במערכת</EmptyRow>
            ) : (
              rows.map((r) => (
                <tr key={r.key}>
                  <td className="font-bold text-shell-2">{r.name}</td>
                  <td><RolePill tone={r.roleTone}>{r.role}</RolePill></td>
                  <td>{r.branch}</td>
                  <td><span className="ds-num font-semibold">{fmt(r.petrol)} ₪</span></td>
                  <td><span className="ds-num font-semibold">{fmt(r.diesel)} ₪</span></td>
                  <td><span className="ds-num font-bold text-available-fg">{fmt(r.petrol + r.diesel)} ₪</span></td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <MobileCardList
          items={rows}
          keyOf={(r) => r.key}
          empty="לא הוגדרו סניפים או מקבלי הקצאה במערכת"
          render={(r) => (
            <>
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-base font-extrabold text-shell-2">{r.name}</span>
                <span className="ds-num font-bold text-available-fg">{fmt(r.petrol + r.diesel)} ₪</span>
              </div>
              <KV label="תפקיד · סניף">{r.role} · {r.branch}</KV>
              <KV label="בנזין 95"><span className="ds-num">{fmt(r.petrol)} ₪</span></KV>
              <KV label="סולר"><span className="ds-num">{fmt(r.diesel)} ₪</span></KV>
            </>
          )}
        />
      </TableCard>

      <ResultDialog result={result} onClose={() => setResult(null)} />
    </InternalLayout>
  );
}

function RolePill({ tone, children }: { tone: BalanceRow["roleTone"]; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold",
        tone === "branch" ? "bg-[#e8f0fd] text-blue-700" : tone === "request" ? "bg-[#efecfd] text-[#4a2fb0]" : "bg-[#f1f3f7] text-ink-soft",
      )}
    >
      {children}
    </span>
  );
}
