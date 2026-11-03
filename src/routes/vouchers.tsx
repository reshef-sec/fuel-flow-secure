import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCcw, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { PageHero } from "@/components/ui/PageHero";
import { ResultDialog, type ResultSummary } from "@/components/ui/ResultDialog";
import { VoucherTable } from "@/components/dashboard/VoucherTable";
import { downloadImportTemplate } from "@/lib/excel";
import { useVoucherImports, type VoucherImportNotice } from "@/lib/useVoucherImports";
import { useAppStore } from "@/store/appStore";

/**
 * מלאי שוברים — the voucher inventory page. Old deep links (`/vouchers?tab=import`, from when this URL
 * redirected to Settings → import) land here; the import buttons are in the hero for admins.
 */
export const Route = createFileRoute("/vouchers")({
  head: () => ({
    meta: [
      { title: "מלאי שוברים | רשף ביטחון" },
      { name: "description", content: "כל כרטיסי הדלק במלאי, לפי סטטוס וסוג דלק." },
      { property: "og:title", content: "מלאי שוברים | רשף ביטחון" },
      { property: "og:type", content: "website" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s.tab === "string" ? { tab: s.tab } : {},
  component: VouchersPage,
});

const RESULT_TITLES: Record<VoucherImportNotice["kind"], Record<VoucherImportNotice["tone"], string>> = {
  stock: { success: "ייבוא המאגר הושלם", info: "לא נוספו כרטיסים", error: "ייבוא המאגר נכשל" },
  redeemed: { success: "קובץ המימושים נקלט", info: "לא עודכנו כרטיסים", error: "ייבוא קובץ המימושים נכשל" },
};

/** Same numbers the import toasts have always reported, as a short result popup. */
function toResult(n: VoucherImportNotice): ResultSummary {
  const tone = n.tone === "info" ? "warning" : n.tone === "error" ? "error" : "success";
  let line = n.message;
  if (n.kind === "stock" && n.added !== undefined) {
    line = `נוספו ${n.added.toLocaleString("he-IL")} כרטיסים · ${(n.skipped ?? 0).toLocaleString("he-IL")} כפולים דולגו`;
  } else if (n.kind === "redeemed" && n.tone === "success" && n.updated !== undefined) {
    line = `עודכנו ${n.updated.toLocaleString("he-IL")} כרטיסים ל'מומש סופית'`;
  }
  return { tone, title: RESULT_TITLES[n.kind][n.tone], line, detail: n.fileName };
}

/** Hidden file input + hero button + "download sample" link for one import. */
function ImportAction({
  label,
  variant,
  icon: Icon,
  onFiles,
  onTemplate,
}: {
  label: string;
  variant: "onnavy" | "glass";
  icon: typeof UploadCloud;
  onFiles: (files: FileList | null) => Promise<void>;
  onTemplate: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col items-stretch gap-1">
      <button type="button" className={`ds-btn ds-btn-${variant}`} disabled={busy} aria-busy={busy} onClick={() => ref.current?.click()}>
        <Icon className="size-4" aria-hidden />
        {busy ? "מייבא…" : label}
      </button>
      <button type="button" className="ds-tpllink self-center" onClick={onTemplate}>
        הורדת קובץ לדוגמה
      </button>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          const files = e.target.files;
          setBusy(true);
          void onFiles(files).finally(() => {
            setBusy(false);
            e.target.value = "";
          });
        }}
      />
    </div>
  );
}

function VouchersPage() {
  const role = useAppStore((s) => s.role);
  // Imports are admin-only, exactly like the Settings import panel (hidden for the read-only viewer).
  const canImport = role === "admin";
  const [result, setResult] = useState<ResultSummary | null>(null);
  // Outcomes → result popup; errors stay as error toasts with the same text as before.
  const { handleStock, handleRedeemed } = useVoucherImports({
    notify: (n) => (n.tone === "error" ? void toast.error(n.message) : setResult(toResult(n))),
  });

  function template(id: "stock" | "paz") {
    void downloadImportTemplate(id)
      .then(() => toast.success("תבנית האקסל הורדה"))
      .catch(() => toast.error("הורדת התבנית נכשלה"));
  }

  return (
    <InternalLayout title="מלאי שוברים">
      <PageHero
        eyebrow="ניהול מלאי"
        title="מלאי שוברים"
        subtitle="כל כרטיסי הדלק במלאי, לפי סטטוס וסוג דלק."
        actions={
          canImport ? (
            <>
              <ImportAction label="ייבוא מאגר כרטיסים" variant="onnavy" icon={UploadCloud} onFiles={handleStock} onTemplate={() => template("stock")} />
              <ImportAction label="ייבוא קובץ מימושים" variant="glass" icon={RefreshCcw} onFiles={handleRedeemed} onTemplate={() => template("paz")} />
            </>
          ) : undefined
        }
      />
      <VoucherTable />
      <ResultDialog result={result} onClose={() => setResult(null)} />
    </InternalLayout>
  );
}
