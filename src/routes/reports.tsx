import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Filter, RotateCcw } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { NoAccess } from "@/components/layout/NoAccess";
import { PageHero } from "@/components/ui/PageHero";
import { Tabs } from "@/components/ui/Tabs";
import { IsraelDateInput } from "@/components/ui/IsraelDateInput";
import { B2bReport } from "@/components/reports/B2bReport";
import { PrivateReport } from "@/components/reports/PrivateReport";
import { emptyReportFilters, type ReportFilterValues } from "@/components/reports/reportData";
import { FUEL_TYPES, fuelLabel } from "@/components/fuel/fuel";
import { MAIN_POOL } from "@/components/dashboard/voucherData";
import { branchLabel, branchOptions } from "@/lib/branchLabels";
import { CARD_STATUS_FILTERS, statusDisplay } from "@/lib/statusDisplay";
import { FormField, Select } from "@/design-system/delek-1ea111";
import { fullName, seesAllData, useAppStore, useCurrentUser } from "@/store/appStore";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "דוחות | רשף ביטחון" },
      {
        name: "description",
        content: "דוח רכב פרטי ודוח רכב עבודה על שוברי הדלק עם סינון לפי תאריך, סניף, סוג דלק וסטטוס וייצוא לאקסל.",
      },
      { property: "og:title", content: "דוחות | רשף ביטחון" },
      { property: "og:description", content: "דוחות שוברים עם סינון וייצוא לאקסל." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const reportTabs = [
  { id: "master", label: "רכב פרטי" },
  { id: "paz", label: "רכב עבודה" },
] as const;

const selectClass = "h-11 rounded-control";

function ReportsPage() {
  const [tab, setTab] = useState<string>("master");
  const branchList = useAppStore((s) => s.branchList);
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();
  const [filters, setFilters] = useState<ReportFilterValues>(emptyReportFilters);
  const branches = branchOptions([MAIN_POOL, ...branchList.map(b => b.name)]);

  // Branch managers are locked to their own branch — no "all branches" option.
  const lockedBranch = seesAllData(role) ? null : (me?.branch ?? "");
  // Supervisors are locked to vouchers assigned to them personally.
  const lockedSupervisor = role === "supervisor" ? (me ? fullName(me) : "") : null;
  const generatedBy = me ? fullName(me) : "";

  const set = (patch: Partial<ReportFilterValues>) => setFilters((f) => ({ ...f, ...patch }));
  const activeCount = [filters.from, filters.to, filters.branch, filters.fuel, filters.status].filter(Boolean).length;

  // Supervisors have no access to reports (client decision 04/11/2026); branch managers see their branch only (lockedBranch).
  if (role === "supervisor") return <NoAccess title="דוחות" />;

  return (
    <InternalLayout title="דוחות">
      <PageHero eyebrow="דוחות וייצוא" title="דוחות" subtitle="בוחרים דוח, מסננים ומייצאים לאקסל." />

      <Tabs items={reportTabs} value={tab} onChange={setTab} label="בחירת דוח" />

      <section aria-label="סינון הדוח" className="ds-card px-[18px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 flex items-center gap-2 text-base font-extrabold text-navy-900">
            <Filter className="size-[18px] text-blue-500" aria-hidden />
            סינון
            {activeCount ? (
              <span className="ds-num rounded-pill bg-waiting-bg px-2 py-px text-xs font-bold text-waiting-fg">{activeCount}</span>
            ) : null}
          </h2>
          <button type="button" className="ds-btn ds-btn-light" onClick={() => setFilters(emptyReportFilters)} disabled={!activeCount}>
            <RotateCcw className="size-4" aria-hidden />
            איפוס סינון
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 min-[900px]:grid-cols-5">
          <FormField label="מתאריך">
            <IsraelDateInput value={filters.from} onChange={from => set({ from })} label="מתאריך" />
          </FormField>
          <FormField label="עד תאריך">
            <IsraelDateInput value={filters.to} onChange={to => set({ to })} label="עד תאריך" />
          </FormField>
          <FormField label="סניף">
            {lockedBranch !== null ? (
              <Select value={lockedBranch} onChange={() => {}} aria-label="סניף" disabled className={selectClass}>
                <option value={lockedBranch}>{lockedBranch ? branchLabel(lockedBranch) : "—"}</option>
              </Select>
            ) : (
              <Select
                value={filters.branch}
                onChange={(e) => set({ branch: e.target.value })}
                aria-label="סניף"
                className={selectClass}
              >
                <option value="">כל הסניפים</option>
                {branches.map((b) => (
                  <option key={b.label} value={b.label}>
                    {b.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="סוג דלק">
            <Select
              value={filters.fuel}
              onChange={(e) => set({ fuel: e.target.value as ReportFilterValues["fuel"] })}
              aria-label="סוג דלק"
              className={selectClass}
            >
              <option value="">הכל</option>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {fuelLabel(f)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="סטטוס">
            <Select
              value={filters.status}
              onChange={(e) => set({ status: e.target.value })}
              aria-label="סטטוס"
              className={selectClass}
            >
              <option value="">כל הסטטוסים</option>
              {CARD_STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {statusDisplay(s).label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </section>

      {tab === "paz" ? (
        <B2bReport filters={filters} generatedBy={generatedBy} />
      ) : (
        <PrivateReport filters={filters} lockedBranch={lockedBranch} lockedSupervisor={lockedSupervisor} generatedBy={generatedBy} />
      )}
    </InternalLayout>
  );
}
