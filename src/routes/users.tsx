import { createFileRoute } from "@tanstack/react-router";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { UsersPanel } from "@/components/settings/UsersPanel";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "ניהול משתמשים | רשף ביטחון" },
      {
        name: "description",
        content: "ניהול משתמשי המערכת: אדמינים, מנהלי סניפים, מפקחים והרשאות.",
      },
      { property: "og:title", content: "ניהול משתמשים | רשף ביטחון" },
      { property: "og:description", content: "ניהול משתמשים והרשאות במערכת השוברים." },
    ],
  }),
  component: () => (
    <InternalLayout title="ניהול משתמשים">
      <UsersPanel />
    </InternalLayout>
  ),
});
