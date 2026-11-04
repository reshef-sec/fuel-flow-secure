import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { PageHero } from "@/components/ui/PageHero";
import { Tabs } from "@/components/ui/Tabs";
import { ReasonsPanel } from "@/components/settings/ReasonsPanel";
import { BranchesPanel } from "@/components/settings/BranchesPanel";
import { UsersPanel } from "@/components/settings/UsersPanel";
import { ClientsPanel } from "@/components/settings/ClientsPanel";
import { AuditPanel } from "@/components/settings/AuditPanel";
import { B2bPanel } from "@/components/settings/B2bPanel";
import { DevelopmentPanel } from "@/components/settings/DevelopmentPanel";
import { TrainingPanel } from "@/components/settings/TrainingPanel";
import { useDevelopmentToolsAccess } from "@/lib/superAdmin";
import { isReadOnlyRole, useAppStore } from "@/store/appStore";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות מערכת | רשף ביטחון" },
      {
        name: "description",
        content: "ניהול משתמשים, סניפים, סיבות הנפקה, מאגרי רכב עבודה ורכב פרטי ויומן פעילות.",
      },
      { property: "og:title", content: "הגדרות מערכת | רשף ביטחון" },
      { property: "og:description", content: "משתמשים, סניפים, מאגרי רכבים ויומן פעילות." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s.tab === "string" ? { tab: s.tab } : {},
  // Imports moved to the inventory page (/vouchers); keep old links working.
  beforeLoad: ({ search }) => {
    if (search.tab === "import") throw redirect({ to: "/vouchers", replace: true });
  },
  component: SettingsPage,
});

const tabs = [
  { id: "users", label: "משתמשים" },
  { id: "branches", label: "סניפים" },
  { id: "reasons", label: "סיבות הנפקה" },
  { id: "b2b", label: "רכב עבודה" },
  { id: "clients", label: "רכב פרטי" },
  { id: "audit", label: "יומן פעילות" },
  { id: "training", label: "סרטוני הדרכה" },
  { id: "dev", label: "כלי פיתוח" },
] as const;

/** Tabs hidden from the read-only viewer: the audit log is admin-only on the server. */
const writeOnlyTabs = new Set<string>(["audit"]);
/** Owner-only tabs (מאיה קורן): the same fail-closed server check as the development tools. */
const ownerOnlyTabs = new Set<string>(["dev", "training"]);

function SettingsPage() {
  const readOnly = useAppStore((s) => isReadOnlyRole(s.role));
  // Development tools: shown only when the server RPC can_use_development_tools allows it (fails closed).
  const devAllowed = useDevelopmentToolsAccess();
  const visibleTabs = tabs.filter(
    (t) => !(readOnly && writeOnlyTabs.has(t.id)) && (!ownerOnlyTabs.has(t.id) || devAllowed),
  );
  const fallback = visibleTabs[0].id;
  const initialTab = Route.useSearch().tab;
  const [selected, setTab] = useState<string>(initialTab ?? fallback);
  const tab = visibleTabs.some((t) => t.id === selected) ? selected : fallback;

  return (
    <InternalLayout title="הגדרות מערכת">
      <PageHero
        eyebrow={readOnly ? "ניהול מערכת · צפייה בלבד" : "ניהול מערכת"}
        title="הגדרות"
        subtitle="משתמשים, סניפים, מאגרי רכבים ויומן פעילות."
      />
      <Tabs items={visibleTabs} value={tab} onChange={setTab} scrollable label="אזורי הגדרות" />
      {tab === "users" ? <UsersPanel /> : null}
      {tab === "branches" ? <BranchesPanel /> : null}
      {tab === "reasons" ? <ReasonsPanel /> : null}
      {tab === "b2b" ? <B2bPanel /> : null}
      {tab === "clients" ? <ClientsPanel /> : null}
      {tab === "audit" ? <AuditPanel /> : null}
      {tab === "training" ? <TrainingPanel /> : null}
      {tab === "dev" ? <DevelopmentPanel /> : null}
    </InternalLayout>
  );
}
