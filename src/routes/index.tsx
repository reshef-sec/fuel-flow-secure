import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FilePlus2, UserCheck } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { VoucherTable } from "@/components/dashboard/VoucherTable";
import { RequestDialog } from "@/components/requests/RequestDialog";
import { PendingRequests } from "@/components/requests/PendingRequests";
import { SupervisorAllocationDialog } from "@/components/allocations/SupervisorAllocationDialog";
import { Button, Card, Select, StatCard } from "@/design-system/delek-1ea111";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";

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

  // Branch managers see their own branch; supervisors only what is assigned to them.
  const vouchers = isBranchManager
    ? allVouchers.filter((v) => v.branch === myBranch)
    : isSupervisor
      ? allVouchers.filter((v) => v.supervisor === myName)
      : allVouchers;

  const branchAvailable = vouchers.filter((v) => v.status === "טרם שומש" && !v.supervisor);
  const balance = isBranchManager
    ? branchAvailable.reduce((t, v) => t + v.amount, 0)
    : isSupervisor
      ? vouchers.filter((v) => v.status === "טרם שומש").reduce((t, v) => t + v.amount, 0)
      : globalBalance;

  // Time-bound metrics use the selected period; wallet metrics always show the live state.
  const since = periodStart(period);
  const timed = since ? vouchers.filter((v) => v.updatedAt >= since) : vouchers;

  const sum = (status: string) =>
    timed.filter((v) => v.status === status).reduce((t, v) => t + v.amount, 0);
  const claimed = sum("מומש סופית");
  const allocated = sum("הוקצה לעובד");
  const total = vouchers.reduce((t, v) => t + v.amount, 0);
  const unusedValue = vouchers
    .filter((v) => v.status === "טרם שומש")
    .reduce((t, v) => t + v.amount, 0);
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
          <p className="text-xs text-muted-foreground">
            היתרה ומלאי השוברים מוצגים תמיד במצב עדכני · המימושים והחסומים לפי התקופה שנבחרה
          </p>
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

      {isBranchManager ? (
        <Card padding="lg" className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">
              היתרה הזמינה שלי · סניף {myBranch || "—"}
            </p>
            <p className="font-display text-3xl font-extrabold tabular-nums text-secondary">
              {balance.toLocaleString("he-IL")} ₪
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {branchAvailable.length} שוברים זמינים להקצאה למפקחי הסניף שלי
            </p>
          </div>
          <Button onClick={() => setSupervisorOpen(true)}>
            <UserCheck className="size-4" />
            הקצאה למפקח
          </Button>
        </Card>
      ) : null}

      {me?.canRequest ? (
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


      <div className="grid gap-5 sm:grid-cols-2">
        <StatCard
          label="תקציב לניצול"
          value={`${balance.toLocaleString("he-IL")} ₪`}
          caption={`מלאי שוברים: ${total.toLocaleString("he-IL")} ₪ · ${vouchers.length} שוברים`}
          percent={pct(unusedValue, total)}
          tone="accent"
        />
        <StatCard
          label="שוברים נמסרו לעובד"
          value={`${(claimed + allocated).toLocaleString("he-IL")} ₪`}
          caption={periodLabels[period]}
          percent={pct(claimed + allocated, total)}
          tone="secondary"
        />
      </div>

      {role === "admin" ? <PendingRequests /> : null}

      <VoucherTable since={since} periodLabel={periodLabels[period]} />

      <RequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} />

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
