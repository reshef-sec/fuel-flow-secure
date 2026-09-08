import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { Tabs } from "@/components/ui/Tabs";
import { ReasonsPanel } from "@/components/settings/ReasonsPanel";
import { BranchesPanel } from "@/components/settings/BranchesPanel";
import { UsersPanel } from "@/components/settings/UsersPanel";
import { ClientsPanel } from "@/components/settings/ClientsPanel";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות מערכת | רשף ביטחון" },
      {
        name: "description",
        content: "ניהול סיבות הנפקה, סניפים, משתמשים ולקוחות ואתרים במערכת שוברי הדלק.",
      },
      { property: "og:title", content: "הגדרות מערכת | רשף ביטחון" },
      { property: "og:description", content: "סיבות הנפקה, סניפים, משתמשים ולקוחות." },
    ],
  }),
  component: SettingsPage,
});

const tabs = [
  { id: "reasons", label: "סיבות הנפקה" },
  { id: "branches", label: "ניהול סניפים" },
  { id: "users", label: "ניהול משתמשים" },
  { id: "clients", label: "לקוחות ואתרים" },
] as const;

function SettingsPage() {
  const [tab, setTab] = useState<string>("reasons");

  return (
    <InternalLayout title="הגדרות מערכת">
      <Tabs items={tabs} value={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === "reasons" ? <ReasonsPanel /> : null}
        {tab === "branches" ? <BranchesPanel /> : null}
        {tab === "users" ? <UsersPanel /> : null}
        {tab === "clients" ? <ClientsPanel /> : null}
      </div>
    </InternalLayout>
  );
}
