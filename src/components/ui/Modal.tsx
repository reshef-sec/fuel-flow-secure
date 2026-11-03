import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

const widths = { sm: "min-[900px]:max-w-[460px]", md: "min-[900px]:max-w-lg", lg: "min-[900px]:max-w-2xl", xl: "min-[900px]:max-w-4xl" } as const;

/**
 * Modal — centred dialog on desktop, bottom sheet under 900px (design: Main.dc.html `.modal`).
 * Escape / backdrop / × close it. Existing call sites (`open`, `onClose`, `title`, `children`) are unchanged;
 * `size`, `description` and `footer` are optional additions.
 *
 *   <Modal open={open} onClose={close} title="הקצאה חדשה" footer={<Button>שמירה</Button>}>…</Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One short line under the title. */
  description?: ReactNode;
  /** Sticky action row at the bottom of the dialog. */
  footer?: ReactNode;
  size?: keyof typeof widths;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the dialog when it opens (unless a child already took it, e.g. autoFocus).
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center min-[900px]:items-center min-[900px]:overflow-y-auto min-[900px]:p-6">
      <button aria-label="סגור חלון" onClick={onClose} className="fixed inset-0 cursor-pointer bg-navy-900/55" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-[71] flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-dialog bg-surface shadow-dialog outline-none min-[900px]:my-auto min-[900px]:max-h-none min-[900px]:rounded-dialog",
          widths[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-table-line px-[22px] py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={titleId} className="m-0 text-lg font-extrabold text-navy-900">{title}</h2>
            {description ? <p className="m-0 text-[13px] text-slate-600">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="סגור" className="ds-iconbtn">
            <X className="size-[18px]" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-[22px]">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-table-line bg-[#fbfcfe] px-[22px] py-3.5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
