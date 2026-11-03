import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

type Tone = "primary" | "mint" | "orange" | "navy";

const tones: Record<Tone, { icon: string; bar: string }> = {
  primary: { icon: "bg-blue-100 text-blue-700", bar: "bg-primary" },
  mint: { icon: "bg-mint-100 text-teal-600", bar: "bg-mint-500" },
  orange: { icon: "bg-orange-100 text-orange-700", bar: "bg-orange-500" },
  navy: { icon: "bg-navy-50 text-navy-700", bar: "bg-navy-700" },
};

/**
 * KPI card of the dashboard (design: Dashboard.dc.html "מדדים עיקריים"): label + icon, a big mono
 * number with unit, an optional progress bar, a note line and an optional footer (link / action).
 */
export function KpiCard({
  label,
  icon: Icon,
  value,
  unit = "₪",
  percent,
  note,
  tone = "primary",
  footer,
  children,
  className,
}: {
  label: string;
  icon: LucideIcon;
  value?: ReactNode;
  unit?: string;
  /** 0–100; omit to hide the bar. */
  percent?: number;
  note?: ReactNode;
  tone?: Tone;
  footer?: ReactNode;
  /** Extra content under the note (e.g. a fuel breakdown). */
  children?: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <article className={cn("ds-card flex flex-col gap-3 px-5 pb-2.5 pt-[18px]", !footer && "pb-[18px]", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-slate-600">{label}</span>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", t.icon)}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </div>
      {value !== undefined ? (
        <div className="flex items-baseline gap-1.5">
          <span className="ds-num text-[27px] font-semibold leading-tight text-navy-900">{value}</span>
          {unit ? <span className="text-sm font-semibold text-slate-600">{unit}</span> : null}
        </div>
      ) : null}
      {percent !== undefined ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {note ? <span className="text-[12.5px] text-slate-600">{note}</span> : null}
      {children}
      {footer ? <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-table-line pt-2">{footer}</div> : null}
    </article>
  );
}
