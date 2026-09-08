import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <button aria-label="סגור חלון" onClick={onClose} className="fixed inset-0 bg-navy-900/50" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-50 my-auto w-full max-w-lg rounded-xl bg-surface shadow-raised"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
          <h2 className="font-display text-lg font-extrabold text-secondary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:shadow-focus"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
