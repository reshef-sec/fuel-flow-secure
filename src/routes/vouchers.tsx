import { createFileRoute } from "@tanstack/react-router";
import { Ticket } from "lucide-react";

import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/vouchers")({
  head: () => ({
    meta: [
      { title: "מאגר שוברים | רשף ביטחון" },
      { name: "description", content: "מאגר שוברי הדלק: מלאי, קודים, סטטוסים וייבוא שוברים חדשים." },
      { property: "og:title", content: "מאגר שוברים | רשף ביטחון" },
      { property: "og:description", content: "ניהול מלאי שוברי הדלק וייבוא שוברים חדשים." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="מאגר שוברים"
      description="כאן יוצג מאגר כל שוברי הדלק, כולל ייבוא מאקסל, חיפוש לפי קוד וסינון לפי סטטוס."
      icon={Ticket}
    />
  ),
});
