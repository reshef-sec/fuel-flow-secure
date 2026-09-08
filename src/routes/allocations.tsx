import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/allocations")({
  head: () => ({
    meta: [
      { title: "הקצאות לסניפים | רשף ביטחון" },
      { name: "description", content: "הקצאת שוברי דלק לסניפים ומעקב על יתרות המלאי בכל סניף." },
      { property: "og:title", content: "הקצאות לסניפים | רשף ביטחון" },
      { property: "og:description", content: "הקצאת שוברים לסניפים ומעקב יתרות." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="הקצאות לסניפים"
      description="כאן תבוצע הקצאת שוברים לסניפים ולמפקחים, עם מעקב על יתרות ומלאי פתוח."
      icon={Building2}
    />
  ),
});
