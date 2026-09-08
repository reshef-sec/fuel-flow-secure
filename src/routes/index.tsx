import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Ticket, CheckCircle2, Ban } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { VoucherTable } from "@/components/dashboard/VoucherTable";
import { Card, StatCard } from "@/design-system/delek-1ea111";


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
  return (
    <InternalLayout title="דשבורד ניהול שוברים">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="סך תקציב" value="556,978 ₪" caption="תקציב שנתי מאושר" percent={75} />
        <StatCard
          label="שוברים זמינים"
          value="224,470 ₪"
          caption="מלאי לא מוקצה"
          percent={70}
          tone="accent"
        />
        <StatCard label="שוברים שמומשו" value="318,508 ₪" caption="מתחילת השנה" percent={57} tone="secondary" />
        <StatCard label="שוברים חסומים" value="16" caption="ממתינים לבדיקה" percent={4} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "תקציב", icon: Wallet },
          { label: "מלאי", icon: Ticket },
          { label: "מימושים", icon: CheckCircle2 },
          { label: "חסומים", icon: Ban },
        ].map(({ label, icon: Icon }) => (
          <Card key={label} padding="sm" variant="outline" className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-blue-100 text-blue-700">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-muted-foreground">
              {label} — עדכון אחרון היום
            </span>
          </Card>
        ))}
      </div>

      <VoucherTable />

    </InternalLayout>
  );
}
