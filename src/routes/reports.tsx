import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart } from "lucide-react";

import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "דוחות | רשף ביטחון" },
      { name: "description", content: "דוח מקיף על שוברי הדלק עם סינון לפי תאריך, סניף ולקוח וייצוא לאקסל." },
      { property: "og:title", content: "דוחות | רשף ביטחון" },
      { property: "og:description", content: "דוחות שוברי דלק עם סינון וייצוא לאקסל." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="דוחות"
      description="כאן יופק הדוח המקיף: סינון לפי טווח תאריכים, סניף, לקוח וסטטוס, כולל ייצוא לאקסל ו-PDF."
      icon={FileBarChart}
    />
  ),
});
