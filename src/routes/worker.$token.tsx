import { createFileRoute } from "@tanstack/react-router";

import { WorkerForm } from "./worker";

/** Personal one-time voucher link sent to a worker (no admin chrome). */
export const Route = createFileRoute("/worker/$token")({
  head: () => ({
    meta: [
      { title: "טופס קבלת שובר דלק אישי | רשף ביטחון" },
      {
        name: "description",
        content: "לינק אישי לקבלת שובר דלק: מילוי ת.ז, טלפון וחתימה דיגיטלית וקבלת קוד השובר.",
      },
      { property: "og:title", content: "טופס קבלת שובר דלק אישי | רשף ביטחון" },
      {
        property: "og:description",
        content: "לינק חד פעמי לעובד לקבלת שובר דלק בחתימה דיגיטלית.",
      },
    ],
  }),
  component: WorkerForm,
});
