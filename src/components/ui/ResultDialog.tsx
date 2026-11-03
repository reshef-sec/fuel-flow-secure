import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

export type ResultTone = "success" | "warning" | "error" | "info";

const tones: Record<ResultTone, { ring: string; Icon: typeof Check }> = {
  success: { ring: "bg-available-bg text-available-fg", Icon: Check },
  warning: { ring: "bg-pending-bg text-pending-fg", Icon: AlertTriangle },
  error: { ring: "bg-redeemed-bg text-redeemed-fg", Icon: X },
  info: { ring: "bg-waiting-bg text-waiting-fg", Icon: Info },
};

export interface ResultSummary {
  tone?: ResultTone;
  /** e.g. "הייבוא הושלם" */
  title: string;
  /** One main line, e.g. "יובאו 120 כרטיסים חדשים · 6 כפולים דולגו" */
  line?: ReactNode;
  /** Small secondary detail (file name, ids …), rendered in mono. */
  detail?: ReactNode;
}

/**
 * ResultDialog — small centred popup summarising the outcome of an action (import, allocation,
 * issuance, approval). Client rule: results are shown as a short popup, not a banner.
 * Pass `result={null}` to close. Optional primary action (e.g. "הצגת הכרטיסים").
 *
 *   const [result, setResult] = useState<ResultSummary | null>(null);
 *   setResult({ tone: "success", title: "הייבוא הושלם", line: `נוספו ${n} כרטיסים`, detail: file.name });
 *   <ResultDialog result={result} onClose={() => setResult(null)} />
 */
export function ResultDialog({
  result,
  onClose,
  action,
}: {
  result: ResultSummary | null;
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!result) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [result, onClose]);

  if (!result) return null;
  const { ring, Icon } = tones[result.tone ?? "success"];

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center min-[900px]:items-center min-[900px]:p-6">
      <button type="button" aria-label="סגירת החלון" onClick={onClose} className="absolute inset-0 cursor-pointer bg-navy-900/55" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex w-full flex-col overflow-hidden rounded-t-dialog bg-surface shadow-dialog min-[900px]:max-w-[460px] min-[900px]:rounded-dialog"
      >
        <div className="flex flex-col items-center gap-3 px-6 pb-5 pt-6 text-center">
          <span className={cn("grid size-[52px] place-items-center rounded-full", ring)}>
            <Icon className="size-[26px]" strokeWidth={2.4} aria-hidden />
          </span>
          <h2 id={titleId} className="m-0 text-[19px] font-extrabold text-navy-900">{result.title}</h2>
          {result.line ? <p className="m-0 text-[15.5px] font-semibold text-ink">{result.line}</p> : null}
          {result.detail ? <span className="ds-num text-[12.5px] text-slate-600">{result.detail}</span> : null}
        </div>
        <div className={cn("grid gap-2 px-6 pb-[22px]", action ? "grid-cols-2" : "grid-cols-1")}>
          {action ? (
            <button type="button" className="ds-btn ds-btn-primary" onClick={action.onClick}>
              {action.label}
            </button>
          ) : null}
          <button ref={closeRef} type="button" className="ds-btn ds-btn-light" onClick={onClose}>
            סגירה
          </button>
        </div>
      </div>
    </div>
  );
}
