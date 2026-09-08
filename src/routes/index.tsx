import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Ticket, CheckCircle2, Ban } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";

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

const rows = [
  { id: "19949", code: "D12345", branch: "צפון", client: 'סלולר בע"מ', amount: "150 ₪", status: "מוקצה" },
  { id: "271008", code: "D12346", branch: "צפון", client: "לקוח כללי", amount: "150 ₪", status: "מומש" },
  { id: "225902", code: "D12347", branch: "מרכז", client: "ירושלים", amount: "150 ₪", status: "מוקצה" },
  { id: "225393", code: "D12348", branch: "מרכז", client: "ירושלים", amount: "200 ₪", status: "חסום" },
  { id: "012345", code: "D12349", branch: "ירושלים", client: "לקוח כללי", amount: "150 ₪", status: "מומש" },
];

const statusVariant = {
  מוקצה: "info",
  מומש: "success",
  חסום: "danger",
} as const;

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

      <Card className="mt-6" padding="none">
        <CardHeader className="p-5 pb-0">
          <CardTitle>שוברים אחרונים</CardTitle>
          <Badge variant="brand" size="md">
            5 רשומות
          </Badge>
        </CardHeader>
        <div className="p-5 pt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>מס״ד</TableHeaderCell>
                <TableHeaderCell>קוד שובר</TableHeaderCell>
                <TableHeaderCell>סניף</TableHeaderCell>
                <TableHeaderCell>לקוח</TableHeaderCell>
                <TableHeaderCell>סכום</TableHeaderCell>
                <TableHeaderCell>סטטוס</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">{r.id}</TableCell>
                  <TableCell className="font-semibold">{r.code}</TableCell>
                  <TableCell>{r.branch}</TableCell>
                  <TableCell>{r.client}</TableCell>
                  <TableCell className="tabular-nums">{r.amount}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[r.status as keyof typeof statusVariant]}>
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </InternalLayout>
  );
}
