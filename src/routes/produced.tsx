import { createFileRoute } from "@tanstack/react-router";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { ProducedLinks } from "@/components/production/ProducedLinks";

export const Route = createFileRoute("/produced")({
  head: () => ({
    meta: [
      { title: "שוברים שהופקו | רשף ביטחון" },
      { name: "description", content: "רשימת לינקים לשוברי דלק שהופקו לעובדים, עם אפשרות להעתקה ושליחה חוזרת." },
      { property: "og:title", content: "שוברים שהופקו | רשף ביטחון" },
      { property: "og:description", content: "לינקים לשוברי דלק שהופקו לעובדים." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProducedPage,
});

function ProducedPage() {
  return (
    <InternalLayout title="שוברים שהופקו">
      <ProducedLinks />
    </InternalLayout>
  );
}
