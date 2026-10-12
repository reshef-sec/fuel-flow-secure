import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FilePlus2, UserCheck } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { VoucherTable } from "@/components/dashboard/VoucherTable";
import { RequestDialog } from "@/components/requests/RequestDialog";
import { PendingRequests } from "@/components/requests/PendingRequests";
import { SupervisorAllocationDialog } from "@/components/allocations/SupervisorAllocationDialog";
import { Button, Card, Select, StatCard } from "@/design-system/delek-1ea111";
import { fullName, MAIN_POOL, useAppStore, useCurrentUser } from "@/store/appStore";
import { BudgetUtilization, SupervisorDistribution } from "@/components/dashboard/BudgetUtilization";
import { isAvailable, isIssued, mainBranch } from "@/components/dashboard/voucherData";

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
  const globalBalance = useAppStore((s) => s.balance);
  const role = useAppStore((s) => s.role);
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
  const branchAvailable = available.filter((v) => !v.supervisor);
  const balance = isBranchManager ? value(branchAvailable) : isSupervisor ? value(available) : globalBalance;
  const branchesBudget = value(available.filter((v) => mainBranch(v.branch) !== MAIN_POOL));

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

  return (
    <InternalLayout title="דשבורד ניהול שוברים">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold text-secondary">תמונת מצב</p>
        </div>
        <Select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label="טווח זמן"
          className="h-10 w-auto text-sm font-semibold"
        >
          {(Object.keys(periodLabels) as Period[]).map((p) => (
            <option key={p} value={p}>
              {periodLabels[p]}
            </option>
          ))}
        </Select>
      </div>

      {me?.canRequest && !isSupervisor && !isBranchManager ? (
        <Card padding="lg" className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-lg font-extrabold text-secondary">
              דרישת שוברים לסניף {me.branch}
            </p>
            <p className="text-sm text-muted-foreground">
              יש לך הרשאה להקים דרישת שוברים לאישור אדמין מרכזי
            </p>
          </div>
          <Button onClick={() => setRequestOpen(true)}>
            <FilePlus2 className="size-4" />
            הגשת דרישת שוברים
          </Button>
        </Card>
      ) : null}

      {role === "admin" ? (
        <div className="grid gap-5 sm:grid-cols-3">
          <StatCard
            label="יתרת תקציב מרכזי"
            value={`${globalBalance.toLocaleString("he-IL")} ₪`}
            caption="טרם הוקצה לסניפים"
            percent={pct(globalBalance, globalBalance + branchesBudget + issuedValue)}
          />
          <StatCard
            label="יתרת תקציב בסניפים"
            value={`${branchesBudget.toLocaleString("he-IL")} ₪`}
            caption="הוקצה לסניפים וטרם הונפק"
            percent={pct(branchesBudget, globalBalance + branchesBudget + issuedValue)}
            tone="accent"
          />
          <StatCard
            label="סך שוברים שהונפקו"
            value={`${issuedValue.toLocaleString("he-IL")} ₪`}
            caption={`${issued.length} שוברים · ${periodLabels[period]}`}
            percent={pct(issuedValue, total)}
            tone="secondary"
          />
        </div>
      ) : isBranchManager ? (
        <div className="grid gap-5 md:grid-cols-3">
          <Card className="flex flex-col justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">היתרה הזמינה שלי</p>
              <p className="font-display text-3xl font-extrabold tabular-nums text-secondary">{balance.toLocaleString("he-IL")} ₪</p>
              <p className="text-xs text-muted-foreground">{branchAvailable.length} שוברים זמינים · סניף {myBranch || "—"}</p>
            </div>
            <Button size="sm" className="self-start" onClick={() => setSupervisorOpen(true)}>
              <UserCheck className="size-4" />
              הקצאה למפקח
            </Button>
          </Card>
          <Card className="flex flex-col justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">סך תקציב הסניף</p>
              <p className="font-display text-3xl font-extrabold tabular-nums text-secondary">{(balance + issuedValue).toLocaleString("he-IL")} ₪</p>
              <p className="text-xs text-muted-foreground">הונפק + יתרה זמינה</p>
            </div>
            {me?.canRequest ? (
              <Button size="sm" variant="outline" className="self-start" onClick={() => setRequestOpen(true)}>
                <FilePlus2 className="size-4" />
                הגשת דרישת שוברים
              </Button>
            ) : null}
          </Card>
          <StatCard
            label="שוברים שהונפקו"
            value={`${issuedValue.toLocaleString("he-IL")} ₪`}
            caption={`${issued.length} שוברים · ${periodLabels[period]}`}
            percent={pct(issuedValue, balance + issuedValue)}
            tone="secondary"
          />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <StatCard
            label="יתרת תקציב לניצול"
            value={`${balance.toLocaleString("he-IL")} ₪`}
            caption="הוקצה אליי וטרם הונפק"
            percent={pct(balance, balance + issuedValue)}
            tone="accent"
          />
          <StatCard
            label="שוברים שהונפקו לעובדים"
            value={`${issuedValue.toLocaleString("he-IL")} ₪`}
            caption={`${issued.length} שוברים · ${periodLabels[period]}`}
            percent={pct(issuedValue, balance + issuedValue)}
            tone="secondary"
          />
        </div>
      )}

      {isBranchManager ? <SupervisorDistribution vouchers={available} /> : null}

      <BudgetUtilization vouchers={allVouchers as never} since={since} role={role} myBranch={myBranch} periodLabel={periodLabels[period]} />

      {role === "admin" ? <PendingRequests /> : null}

      <VoucherTable since={since} periodLabel={periodLabels[period]} />

      {!isSupervisor && <RequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />}

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
