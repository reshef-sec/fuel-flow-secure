import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Ticket, CheckCircle2, Ban, FilePlus2, UserCheck } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { VoucherTable } from "@/components/dashboard/VoucherTable";
import { RequestDialog } from "@/components/requests/RequestDialog";
import { PendingRequests } from "@/components/requests/PendingRequests";
import { SupervisorAllocationDialog } from "@/components/allocations/SupervisorAllocationDialog";
import { Button, Card, StatCard } from "@/design-system/delek-1ea111";
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

function Dashboard() {
  const allVouchers = useAppStore((s) => s.vouchers);
  const globalBalance = useAppStore((s) => s.balance);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();
  const [requestOpen, setRequestOpen] = useState(false);
  const [supervisorOpen, setSupervisorOpen] = useState(false);

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

  const sum = (status: string) =>
    vouchers.filter((v) => v.status === status).reduce((t, v) => t + v.amount, 0);
  const claimed = sum("מומש סופית");
  const allocated = sum("הוקצה לעובד");
  const blocked = vouchers.filter((v) => v.status === "חסום").length;
  const total = vouchers.reduce((t, v) => t + v.amount, 0);

  return (
    <InternalLayout title="דשבורד ניהול שוברים">
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


      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="יתרה זמינה לחלוקה"
          value={`${balance.toLocaleString("he-IL")} ₪`}
          caption="ארנק וירטואלי"
          percent={Math.min(100, Math.round((balance / 15000) * 100))}
        />
        <StatCard
          label="שווי מלאי שוברים"
          value={`${total.toLocaleString("he-IL")} ₪`}
          caption="כלל השוברים במערכת"
          percent={70}
          tone="accent"
        />
        <StatCard
          label="שוברים שמומשו"
          value={`${claimed.toLocaleString("he-IL")} ₪`}
          caption="מתחילת השנה"
          percent={total ? Math.round((claimed / total) * 100) : 0}
          tone="secondary"
        />
        <StatCard
          label="שוברים חסומים"
          value={blocked}
          caption="ממתינים לבדיקה"
          percent={vouchers.length ? Math.round((blocked / vouchers.length) * 100) : 0}
        />
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "תקציב", icon: Wallet, value: `${balance.toLocaleString("he-IL")} ₪` },
          { label: "מלאי", icon: Ticket, value: `${vouchers.length} שוברים` },
          { label: "מימושים", icon: CheckCircle2, value: `${claimed.toLocaleString("he-IL")} ₪` },
          { label: "הוקצה לעובדים", icon: Ban, value: `${allocated.toLocaleString("he-IL")} ₪` },
        ].map(({ label, icon: Icon, value }) => (
          <Card key={label} padding="md" variant="outline" className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-blue-100 text-blue-700">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-muted-foreground">
                {label}
              </span>
              <span className="block truncate text-sm font-bold tabular-nums text-secondary">
                {value}
              </span>
            </span>
          </Card>
        ))}
      </div>

      {role === "admin" ? <PendingRequests /> : null}

      <VoucherTable />

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
