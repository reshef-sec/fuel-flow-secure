import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/issue-voucher")({
  beforeLoad: () => { throw redirect({ to: "/supervisor" }); },
  head: () => ({ meta: [
    { title: "יצירת לינק שובר לעובד | רשף ביטחון" },
    { name: "description", content: "יצירת שוברי בנזין וסולר לעובדים מתוך המלאי הזמין." },
    { property: "og:title", content: "יצירת לינק שובר לעובד | רשף ביטחון" },
    { property: "og:description", content: "הפקת לינק אישי לעובד לפי סוג הדלק והמלאי הזמין." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});