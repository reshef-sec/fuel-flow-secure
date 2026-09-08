import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";

import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "יומן פעולות | רשף ביטחון" },
      { name: "description", content: "יומן פעולות מלא: מי ביצע כל פעולה, מתי ומאיזו כתובת IP." },
      { property: "og:title", content: "יומן פעולות | רשף ביטחון" },
      { property: "og:description", content: "מעקב מלא אחר פעולות המשתמשים במערכת." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="יומן פעולות"
      description="כאן יוצג יומן הפעולות המלא: משתמש, פעולה, שעה וכתובת IP, לצורכי בקרה וביקורת."
      icon={ScrollText}
    />
  ),
});
