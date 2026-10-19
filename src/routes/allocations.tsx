import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Send, Ticket } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { NoAccess } from "@/components/layout/NoAccess";
import { AllocationDialog } from "@/components/dashboard/AllocationDialog";
import { Badge, Button, Card } from "@/design-system/delek-1ea111";
import { useAppStore } from "@/store/appStore";
import { useCentralInventorySummary } from "@/lib/useCentralInventorySummary";
import { useLiveInventory } from "@/lib/useLiveInventory";
import { FuelBreakdown } from "@/components/fuel/fuel";

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

function AllocationsPage() {
  const branchList = useAppStore((s) => s.branchList);
  const vouchers = useAppStore((s) => s.vouchers);
  const role = useAppStore((s) => s.role);
  const { summary, error: inventoryError } = useCentralInventorySummary(role === "admin");
  useLiveInventory(role === "admin");
  const [allocOpen, setAllocOpen] = useState(false);
  const [presetBranch, setPresetBranch] = useState<string | undefined>(undefined);

  if (role !== "admin") return <NoAccess title="הקצאות לסניפים" />;

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
      availableList: available,
      balance: available.reduce((sum, v) => sum + v.amount, 0),
      allocated: rows.filter((v) => v.status === "הוקצה לעובד").length,
    };
  });

  return (
    <InternalLayout title="הקצאות לסניפים">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
        <p className="text-sm text-muted-foreground">
          יתרה זמינה לחלוקה:{" "}
          <span className="font-bold tabular-nums text-secondary">
            {summary ? `${summary.total_available_amount.toLocaleString("he-IL")} ₪` : "—"}
          </span>
        </p>
        {summary ? <FuelBreakdown totals={{ "בנזין": summary.gasoline_amount, "סולר": summary.diesel_amount }} className="mt-2" /> : <p className="mt-2 text-sm text-danger">{inventoryError ?? "טוען יתרת מלאי…"}</p>}
        </div>
        <Button onClick={() => openAllocation(undefined)}>
          <Send className="size-4" />
          ביצוע הקצאה יזומה
        </Button>
      </div>


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
                    <FuelBreakdown list={b.availableList} />
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


      <AllocationDialog
        open={allocOpen}
        onClose={() => setAllocOpen(false)}
        presetTarget={presetBranch}
      />
    </InternalLayout>
  );
}
