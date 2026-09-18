import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Send, Ticket, UserCheck, Wallet } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { SupervisorAllocationDialog } from "@/components/allocations/SupervisorAllocationDialog";
import { AllocationDialog } from "@/components/dashboard/AllocationDialog";
import { Badge, Button, Card } from "@/design-system/delek-1ea111";
import { useAppStore } from "@/store/appStore";

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
    ],
  }),
  component: AllocationsPage,
});

function AllocationsPage() {
  const branchList = useAppStore((s) => s.branchList);
  const vouchers = useAppStore((s) => s.vouchers);
  const users = useAppStore((s) => s.users);
  const role = useAppStore((s) => s.role);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [presetBranch, setPresetBranch] = useState<string | undefined>(undefined);

  function openAllocation(branch?: string) {
    setPresetBranch(branch);
    setAllocOpen(true);
  }

  const stats = branchList.map((b) => {
    const rows = vouchers.filter((v) => v.branch === b.name);
    const available = rows.filter((v) => v.status === "טרם שומש" && !v.supervisor);
    return {
      ...b,
      stock: rows.length,
      availableCount: available.length,
      balance: available.reduce((sum, v) => sum + v.amount, 0),
      allocated: rows.filter((v) => v.status === "הוקצה לעובד").length,
    };
  });

  const myBranch =
    users.find((u) => u.role === "branch")?.branch ?? branchList[0]?.name ?? "מרכז";
  const mine = stats.find((b) => b.name === myBranch);
  const isBranchManager = role === "branch";

  return (
    <InternalLayout title="הקצאות לסניפים">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          יתרה זמינה לחלוקה:{" "}
          <span className="font-bold tabular-nums text-secondary">
            {balance.toLocaleString("he-IL")} ₪
          </span>
        </p>
        <Button onClick={() => openAllocation(undefined)}>
          <Send className="size-4" />
          ביצוע הקצאה יזומה
        </Button>
      </div>

      {isBranchManager && mine ? (
        <Card padding="lg" className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-mint-100 text-teal-600">
                <Wallet className="size-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">
                  היתרה הזמינה שלי · {mine.name}
                </p>
                <p className="font-display text-3xl font-extrabold tabular-nums text-secondary">
                  {mine.balance.toLocaleString("he-IL")} ₪
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {mine.availableCount} שוברים זמינים להקצאה למפקחי הסניף
                </p>
              </div>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <UserCheck className="size-4" />
              הקצאה למפקח
            </Button>
          </div>
        </Card>
      ) : null}

      <section>
        <h2 className="font-display text-xl font-extrabold text-secondary">מלאי ויתרות סניפים</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.length === 0 ? (
            <Card padding="lg" className="text-sm text-muted-foreground">
              לא הוגדרו סניפים במערכת
            </Card>
          ) : (
            stats.map((b) => (
              <Card key={b.id} padding="lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-lg font-extrabold text-secondary">{b.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.manager || "—"} · {b.city || "—"}
                    </p>
                  </div>
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-blue-100 text-blue-700">
                    <Building2 className="size-5" />
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface-muted p-4">
                    <p className="text-xs font-semibold text-muted-foreground">שוברים במלאי</p>
                    <p className="font-display text-2xl font-extrabold tabular-nums text-secondary">
                      {b.stock.toLocaleString("he-IL")}
                    </p>
                  </div>
                  <div className="rounded-lg bg-mint-100 p-4">
                    <p className="text-xs font-semibold text-muted-foreground">יתרה זמינה</p>
                    <p className="font-display text-2xl font-extrabold tabular-nums text-secondary">
                      {b.balance.toLocaleString("he-IL")} ₪
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge variant="info" size="md">
                    <Ticket className="size-3.5" />
                    {b.availableCount} טרם שומשו
                  </Badge>
                  <Badge variant="purple" size="md">
                    {b.allocated} הוקצו לעובדים
                  </Badge>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => openAllocation(b.name)}>
                    <Send className="size-4" />
                    הקצה
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      <SupervisorAllocationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        branch={myBranch}
        branchBalance={mine?.balance ?? 0}
      />

      <AllocationDialog
        open={allocOpen}
        onClose={() => setAllocOpen(false)}
        presetTarget={presetBranch}
      />
    </InternalLayout>
  );
}
