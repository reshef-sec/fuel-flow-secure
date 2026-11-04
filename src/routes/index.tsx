import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ChevronLeft, FilePlus2, Fuel, Plus, Send, Ticket, UserCheck, Wallet } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { PageHero } from "@/components/ui/PageHero";
import { FilterChips } from "@/components/ui/FilterChips";
import { Greeting, GREETING_SUBTITLE } from "@/components/dashboard/Greeting";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FuelBreakdown } from "@/components/fuel/fuel";
import { PoolDenominations } from "@/components/dashboard/PoolDenominations";
import { RequestDialog } from "@/components/requests/RequestDialog";
import { PendingRequests } from "@/components/requests/PendingRequests";
import { SupervisorAllocationDialog } from "@/components/allocations/SupervisorAllocationDialog";
import { fullName, isReadOnlyRole, MAIN_POOL, seesAllData, useAppStore, useCurrentUser } from "@/store/appStore";
import { BudgetUtilization, SupervisorDistribution } from "@/components/dashboard/BudgetUtilization";
import { isAvailable, isIssued, mainBranch } from "@/components/dashboard/voucherData";
import { branchStockTotal } from "@/lib/stockBalances";
import { stockHolder } from "@/lib/issuanceStock";
import { useLiveInventory } from "@/lib/useLiveInventory";
import { useCentralInventorySummary } from "@/lib/useCentralInventorySummary";
import { branchLabel } from "@/lib/branchLabels";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "דשבורד ניהול שוברי דלק | רשף ביטחון" },
      {
        name: "description",
        content: "מערכת ניהול שוברי דלק של רשף ביטחון: מלאי, הקצאות לסניפים, מימושים ודוחות.",
      },
      { property: "og:title", content: "דשבורד ניהול שוברי דלק | רשף ביטחון" },
      {
        property: "og:description",
        content: "ניהול מלאי שוברי דלק, הקצאות לסניפים ומעקב מימושים במקום אחד.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type Period = "month" | "ytd" | "all";

const periodLabels: Record<Period, string> = {
  month: "החודש הנוכחי",
  ytd: "מתחילת השנה",
  all: "כל התקופה",
};

/** First day of the selected period as an ISO date, or null for all time. */
function periodStart(period: Period): string | null {
  if (period === "all") return null;
  const now = new Date();
  const month = period === "month" ? now.getMonth() : 0;
  const first = new Date(now.getFullYear(), month, 1);
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-01`;
}


function Dashboard() {
  const allVouchers = useAppStore((s) => s.vouchers);
  const role = useAppStore((s) => s.role);
  // Admin and the read-only viewer share the organisation-wide dashboard.
  const adminView = seesAllData(role);
  const readOnly = isReadOnlyRole(role);
  useLiveInventory(adminView);
  const { summary, totalAvailableBalance, error: inventoryError } = useCentralInventorySummary(adminView);
  const me = useCurrentUser();
  const [requestOpen, setRequestOpen] = useState(false);
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("month");

  const isBranchManager = role === "branch";
  const isSupervisor = role === "supervisor";
  const myBranch = me?.branch ?? "";
  const myName = me ? fullName(me) : "";

  const authId = useAppStore((s) => s.authId);
  // Branch managers see their own branch; supervisors only what is assigned to them.
  const vouchers = isBranchManager
    ? allVouchers.filter((v) => mainBranch(v.branch) === mainBranch(myBranch))
    : isSupervisor
      ? allVouchers.filter((v) => (authId && v.supervisorId === authId) || v.supervisor === myName)
      : allVouchers;

  const value = (list: typeof vouchers) => list.reduce((t, v) => t + v.amount, 0);
  const available = vouchers.filter(isAvailable);
  // Branch-manager budget = branch vouchers not yet given to a supervisor.
  const branchAvailable = available.filter((v) => !stockHolder(v));
  const balance = isBranchManager ? value(branchAvailable) : isSupervisor ? value(available) : totalAvailableBalance ?? 0;
  // Shared with the allocations page (src/lib/stockBalances.ts) so both always show the same total.
  const branchesBudget = branchStockTotal(vouchers);

  // Time-bound metrics use the selected period; budget metrics always show the live state.
  const since = periodStart(period);
  const issuedAll = vouchers.filter(isIssued);
  const issued = since ? issuedAll.filter((v) => (v.deliveredAt ?? v.updatedAt) >= since) : issuedAll;
  const issuedValue = value(issued);
  const total = value(vouchers);
  /** Safe percentage: 0 when the denominator is empty or the result isn't finite. */
  const pct = (part: number, whole: number) => {
    if (!whole) return 0;
    const r = Math.round((part / whole) * 100);
    return Number.isFinite(r) ? Math.max(0, Math.min(100, r)) : 0;
  };

  const ils = (n: number) => n.toLocaleString("he-IL");
  // Same condition as the former "דרישת שוברים לסניף" card (admin with request permission).
  const canRequestHere = Boolean(me?.canRequest && !isSupervisor && !isBranchManager && !readOnly);
  const smallBtn = "ds-btn min-h-10 rounded-[10px] px-[13px] text-[13px]";

  return (
    <InternalLayout title="דשבורד ניהול שוברים">
      <PageHero
        eyebrow="דשבורד ניהול שוברים"
        title={<Greeting />}
        subtitle={GREETING_SUBTITLE}
        actions={
          <>
            <Link to="/vouchers" className="ds-btn ds-btn-glass no-underline hover:text-white">
              <Ticket className="size-4" aria-hidden />
              למלאי השוברים
            </Link>
            {role === "admin" ? (
              <Link to="/allocations" className="ds-btn ds-btn-onnavy no-underline">
                <Plus className="size-4" strokeWidth={2.4} aria-hidden />
                הקצאה לסניף
              </Link>
            ) : null}
            {canRequestHere && me ? (
              <button type="button" className="ds-btn ds-btn-onnavy" onClick={() => setRequestOpen(true)}>
                <FilePlus2 className="size-4" aria-hidden />
                דרישת שוברים לסניף {branchLabel(me.branch)}
              </button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 max-[899.98px]:flex-col max-[899.98px]:items-stretch">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-[19px] font-extrabold text-navy-900">תמונת מצב</h2>
          <span className="text-[13px] text-slate-600">
            מדדי הנפקה לפי {periodLabels[period]} · מדדי תקציב מציגים את המצב העדכני
          </span>
        </div>
        <FilterChips
          label="טווח זמן"
          value={period}
          onChange={setPeriod}
          items={(Object.keys(periodLabels) as Period[]).map((p) => ({ value: p, label: periodLabels[p] }))}
        />
      </div>

      {adminView ? (
        <section aria-label="מדדים עיקריים" className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <KpiCard
            label="יתרת תקציב מרכזי"
            icon={Wallet}
            value={summary ? ils(balance) : "—"}
            unit={summary ? "₪" : ""}
            note="טרם הוקצה לסניפים"
            percent={pct(balance, balance + branchesBudget + issuedValue)}
          />
          <KpiCard
            label="יתרת תקציב בסניפים"
            icon={Building2}
            tone="mint"
            value={ils(branchesBudget)}
            note="הוקצה לסניפים וטרם הונפק"
            percent={pct(branchesBudget, balance + branchesBudget + issuedValue)}
            footer={<CardLink to="/allocations">להקצאות</CardLink>}
          />
          <KpiCard
            label="סך שוברים שהונפקו"
            icon={Send}
            tone="orange"
            value={ils(issuedValue)}
            note={`${issued.length} שוברים · ${periodLabels[period]}`}
            percent={pct(issuedValue, total)}
            footer={<CardLink to="/produced">לשוברים שהופקו</CardLink>}
          />
          <KpiCard label="יתרה זמינה לפי סוג דלק" icon={Fuel} tone="navy" note="מאגר מרכזי">
            {summary ? (
              <FuelBreakdown totals={{ "בנזין": summary.gasoline_amount, "סולר": summary.diesel_amount }} className="text-sm" />
            ) : (
              <p className="m-0 text-sm text-danger">{inventoryError ?? "טוען יתרת מלאי…"}</p>
            )}
          </KpiCard>
        </section>
      ) : isBranchManager ? (
        <section aria-label="מדדים עיקריים" className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          <KpiCard
            label="היתרה הזמינה שלי"
            icon={Wallet}
            tone="mint"
            value={ils(balance)}
            note={`${branchAvailable.length} שוברים זמינים · סניף ${myBranch ? branchLabel(myBranch) : "—"}`}
            footer={
              <button type="button" className={`${smallBtn} ds-btn-primary`} onClick={() => setSupervisorOpen(true)}>
                <UserCheck className="size-4" aria-hidden />
                הקצאה למפקח
              </button>
            }
          >
            <FuelBreakdown list={branchAvailable} />
          </KpiCard>
          <KpiCard
            label="סך תקציב הסניף"
            icon={Building2}
            value={ils(value(available) + issuedValue)}
            note="הונפק + יתרה זמינה"
            footer={
              me?.canRequest ? (
                <button type="button" className={`${smallBtn} ds-btn-light`} onClick={() => setRequestOpen(true)}>
                  <FilePlus2 className="size-4" aria-hidden />
                  הגשת דרישת שוברים
                </button>
              ) : undefined
            }
          />
          <KpiCard
            label="שוברים שהונפקו"
            icon={Send}
            tone="orange"
            value={ils(issuedValue)}
            note={`${issued.length} שוברים · ${periodLabels[period]}`}
            percent={pct(issuedValue, value(available) + issuedValue)}
          />
        </section>
      ) : (
        <section aria-label="מדדים עיקריים" className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          <KpiCard
            label="יתרת תקציב לניצול"
            icon={Wallet}
            tone="mint"
            value={ils(balance)}
            note="הוקצה אליי וטרם הונפק"
            percent={pct(balance, balance + issuedValue)}
          />
          <KpiCard
            label="שוברים שהונפקו לעובדים"
            icon={Send}
            tone="orange"
            value={ils(issuedValue)}
            note={`${issued.length} שוברים · ${periodLabels[period]}`}
            percent={pct(issuedValue, balance + issuedValue)}
          />
          <KpiCard label="פירוט יתרה זמינה לפי סוג דלק" icon={Fuel} tone="navy">
            <FuelBreakdown list={available} className="text-sm" />
          </KpiCard>
        </section>
      )}

      {adminView ? (
        <section className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
          <PoolDenominations summary={summary} error={inventoryError} />
          <BudgetUtilization vouchers={allVouchers as never} since={since} role={role} myBranch={myBranch} periodLabel={periodLabels[period]} />
        </section>
      ) : null}

      {isBranchManager ? <SupervisorDistribution vouchers={available} issued={issuedValue} /> : null}

      {adminView ? (
        <div id="requests" className="scroll-mt-6">
          <PendingRequests readOnly={readOnly} />
        </div>
      ) : null}

      {/* The full voucher table moved to its own page (/vouchers). */}
      <Link
        to="/vouchers"
        className="ds-card flex items-center justify-between gap-4 px-5 py-4 text-navy-900 no-underline transition-colors hover:bg-table-hover"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-blue-100 text-blue-700">
            <Ticket className="size-5" aria-hidden />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-bold">טבלת השוברים המלאה</span>
            <span className="text-[12.5px] text-slate-600">חיפוש, סינון לפי סטטוס וסוג דלק וייצוא לאקסל — בעמוד מלאי שוברים</span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary">
          למלאי השוברים
          <ChevronLeft className="size-4" aria-hidden />
        </span>
      </Link>

      {!isSupervisor && !readOnly && <RequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />}

      {isBranchManager ? (
        <SupervisorAllocationDialog
          open={supervisorOpen}
          onClose={() => setSupervisorOpen(false)}
          branch={myBranch}
          branchBalance={balance}
        />
      ) : null}
    </InternalLayout>
  );
}

/** Small "go to page" link at the bottom of a KPI card. */
function CardLink({ to, children }: { to: "/allocations" | "/produced"; children: string }) {
  return (
    <Link to={to} className="inline-flex min-h-11 w-full items-center justify-between gap-1 px-1 text-[13px] font-semibold text-primary no-underline hover:text-blue-700">
      <span>{children}</span>
      <ChevronLeft className="size-3.5" aria-hidden />
    </Link>
  );
}
