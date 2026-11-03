import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

/** Small red tag next to a client that is no longer active in its vehicle pool. */
export function InactiveClientTag() {
  return (
    <span className="ms-1.5 inline-flex items-center rounded-pill bg-redeemed-bg px-2 py-px align-middle text-[11px] font-bold text-redeemed-fg">
      לא פעיל
    </span>
  );
}

/** White card holding a report: title + count/sum, optional view switch, "ייצוא לאקסל", table body and pager footer. */
export function ReportCard({
  title,
  count,
  countUnit,
  sum,
  switcher,
  onExport,
  footer,
  children,
}: {
  title: string;
  count: number;
  countUnit: string;
  sum: number;
  switcher?: ReactNode;
  onExport: () => Promise<void>;
  footer: ReactNode;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const exportNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onExport();
      toast.success("הדוח יוצא לאקסל בהצלחה");
    } catch {
      toast.error("ייצוא הדוח נכשל");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label={title} className="ds-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-table-line px-[18px] py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-lg font-extrabold text-navy-900">{title}</h2>
          <span className="text-[13px] text-slate-600">
            <span className="ds-num">{count.toLocaleString("he-IL")}</span> {countUnit} · סה"כ{" "}
            <span className="ds-num font-bold text-navy-900">{sum.toLocaleString("he-IL")} ₪</span>
          </span>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 min-[900px]:w-auto max-[899.98px]:[&>*]:flex-1">
          {switcher}
          <button type="button" className="ds-btn ds-btn-primary" onClick={() => void exportNow()} disabled={busy}>
            <Download className="size-4" aria-hidden />
            {busy ? "מייצא…" : "ייצוא לאקסל"}
          </button>
        </div>
      </div>
      {children}
      <div className="border-t border-table-line bg-[#fbfcfe] px-[18px] py-3.5">{footer}</div>
    </section>
  );
}
