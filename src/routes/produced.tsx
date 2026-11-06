import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { PageHero } from "@/components/ui/PageHero";
import { ProducedLinks, useProducedRows, type ProducedRow } from "@/components/production/ProducedLinks";
import { fuelLabel } from "@/components/fuel/fuel";
import { downloadReport } from "@/lib/excel";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";

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
  const role = useAppStore((s) => s.role);
  const me = useCurrentUser();
  const rows = useProducedRows();
  const [exporting, setExporting] = useState(false);

  async function exportExcel() {
    setExporting(true);
    try {
      await downloadReport<ProducedRow>({
        fileName: "שוברים-שהופקו.xlsx",
        title: "שוברים שהופקו",
        subtitle: `${rows.length.toLocaleString("he-IL")} קישורים`,
        generatedBy: me ? fullName(me) : undefined,
        columns: [
          { header: "תאריך", key: "date", type: "date", get: (r) => r.link.createdAt },
          { header: "עובד", key: "worker", type: "text", get: (r) => r.link.employeeName ?? "" },
          { header: "לקוחות", key: "clients", type: "text", width: 36, get: (r) => r.clients },
          { header: "סכום", key: "total", type: "money", get: (r) => r.link.total },
          { header: "כרטיסים", key: "cards", type: "number", get: (r) => r.link.serials.length },
          { header: "סוג דלק", key: "fuel", type: "text", get: (r) => r.fuels.map(fuelLabel).join(" + ") },
          { header: "סטטוס קישור", key: "status", type: "text", get: (r) => r.status },
        ],
        rows,
        totals: true,
      });
    } catch (e) {
      toast.error((e as Error).message || "ייצוא הקובץ נכשל");
    } finally {
      setExporting(false);
    }
  }

  return (
    <InternalLayout title="שוברים שהופקו">
      <PageHero
        eyebrow="הנפקות"
        title="שוברים שהופקו"
        subtitle="לינקים שהופקו לעובדים והאם נחתמו."
        actions={
          <>
            <button type="button" className="ds-btn ds-btn-glass" onClick={() => void exportExcel()} disabled={exporting || rows.length === 0}>
              <FileSpreadsheet className="size-4" aria-hidden />
              {exporting ? "מייצא…" : "ייצוא לאקסל"}
            </button>
            {role === "viewer" ? null : (
              <Link to="/supervisor" className="ds-btn ds-btn-onnavy">
                <Plus className="size-4" aria-hidden />
                הנפקה חדשה
              </Link>
            )}
          </>
        }
      />
      <ProducedLinks />
    </InternalLayout>
  );
}
