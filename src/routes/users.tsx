import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "ניהול משתמשים | רשף ביטחון" },
      { name: "description", content: "ניהול משתמשי המערכת: אדמינים, קציני רכב, מפקחים והרשאות." },
      { property: "og:title", content: "ניהול משתמשים | רשף ביטחון" },
      { property: "og:description", content: "ניהול משתמשים והרשאות במערכת השוברים." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="ניהול משתמשים"
      description="כאן ינוהלו משתמשי המערכת וההרשאות שלהם: אדמין מרכזי, קציני רכב ומפקחי סניפים."
      icon={Users}
    />
  ),
});
