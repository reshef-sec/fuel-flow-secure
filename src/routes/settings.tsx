import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, Building2, ListChecks, ScrollText, Users } from "lucide-react";


import { InternalLayout } from "@/components/layout/InternalLayout";
import { Tabs } from "@/components/ui/Tabs";
import { ReasonsPanel } from "@/components/settings/ReasonsPanel";
import { BranchesPanel } from "@/components/settings/BranchesPanel";
import { UsersPanel } from "@/components/settings/UsersPanel";
import { ClientsPanel } from "@/components/settings/ClientsPanel";
import { AuditPanel } from "@/components/settings/AuditPanel";
import { B2bPanel } from "@/components/settings/B2bPanel";
import { DemoPanel } from "@/components/settings/DemoPanel";
import { useIsSuperAdmin } from "@/lib/superAdmin";
import { FlaskConical } from "lucide-react";


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
  { id: "reasons", label: "סיבות הנפקה", icon: ListChecks },
  { id: "branches", label: "ניהול סניפים", icon: Building2 },
  { id: "users", label: "ניהול משתמשים", icon: Users },
  { id: "clients", label: "מאגר רכב פרטי", icon: Briefcase },
  { id: "b2b", label: "מאגר רכב עבודה", icon: Building2 },
  { id: "audit", label: "יומן פעילות", icon: ScrollText },
] as const;


function SettingsPage() {
  const [tab, setTab] = useState<string>("reasons");
  const isSuper = useIsSuperAdmin();
  const items = isSuper ? [...tabs, { id: "demo", label: "סביבת דמו", icon: FlaskConical }] : tabs;

  return (
    <InternalLayout title="הגדרות מערכת">
      <Tabs items={items} value={tab} onChange={setTab} />
      {isSuper && tab === "demo" ? <div className="mt-6"><DemoPanel /></div> : null}
      <div className="mt-6">
        {tab === "reasons" ? <ReasonsPanel /> : null}
        {tab === "branches" ? <BranchesPanel /> : null}
        {tab === "users" ? <UsersPanel /> : null}
        {tab === "clients" ? <ClientsPanel /> : null}
        {tab === "b2b" ? <B2bPanel /> : null}
        {tab === "audit" ? <AuditPanel /> : null}
      </div>

    </InternalLayout>
  );
}
