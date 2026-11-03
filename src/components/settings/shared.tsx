import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Input } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

/** Settings section card: title (+ optional count/sub line) and a tools row; body below. */
export function SettingsCard({
  label,
  title,
  sub,
  tools,
  children,
  footer,
  className,
}: {
  label: string;
  title: ReactNode;
  sub?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={label} className={cn("ds-card overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-table-line px-[18px] py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-lg font-extrabold text-navy-900">{title}</h2>
          {sub ? <span className="text-[13px] text-slate-600">{sub}</span> : null}
        </div>
        {tools ? <div className="flex w-full flex-wrap items-center gap-2 min-[900px]:w-auto">{tools}</div> : null}
      </div>
      {children}
      {footer ? <div className="border-t border-table-line bg-[#fbfcfe] px-[18px] py-3.5">{footer}</div> : null}
    </section>
  );
}

/** Search box with a leading icon (44px tall). */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full min-[900px]:w-64", className)}>
      <Search aria-hidden className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 rounded-control pe-9"
      />
    </div>
  );
}

/** Small red "לא פעיל" tag (inactive client / vehicle). */
export function InactiveTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-pill bg-redeemed-bg px-2 py-px text-[11.5px] font-bold text-redeemed-fg", className)}>
      לא פעיל
    </span>
  );
}

/** Centered empty / loading message under a table. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-600">{children}</div>;
}
