import { forwardRef } from "react";
import { cn } from "../lib/utils";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: React.ReactNode;
  tone?: "primary" | "accent" | "secondary";
}

const tones = {
  primary: "bg-primary",
  accent: "bg-accent",
  secondary: "bg-secondary",
} as const;

/** Horizontal completion bar for a single metric. */
export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, value, max = 100, label, tone = "primary", ...props }, ref) => {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return (
      <div ref={ref} className={cn("flex items-center gap-3", className)} {...props}>
        {label ? (
          <span className="min-w-16 text-sm font-medium text-muted-foreground">{label}</span>
        ) : null}
        <div
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-muted"
        >
          <div className={cn("h-full rounded-pill", tones[tone])} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-10 text-end text-sm font-semibold tabular-nums text-foreground">
          {Math.round(pct)}%
        </span>
      </div>
    );
  },
);
ProgressBar.displayName = "ProgressBar";

export interface DonutStatProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  size?: number;
  tone?: "primary" | "accent" | "secondary";
}

/** Ring gauge echoing the brand mark, for a single percentage. */
export const DonutStat = forwardRef<HTMLDivElement, DonutStatProps>(
  ({ className, value, size = 112, tone = "primary", ...props }, ref) => {
    const pct = Math.max(0, Math.min(100, value));
    const color =
      tone === "accent"
        ? "var(--color-accent)"
        : tone === "secondary"
          ? "var(--color-secondary)"
          : "var(--color-primary)";
    return (
      <div
        ref={ref}
        role="img"
        aria-label={`${Math.round(pct)}%`}
        className={cn("relative grid place-items-center", className)}
        style={{ width: size, height: size }}
        {...props}
      >
        <div
          className="absolute inset-0 rounded-pill"
          style={{
            background: `conic-gradient(${color} ${pct}%, var(--color-surface-muted) 0)`,
          }}
        />
        <div
          className="absolute rounded-pill bg-surface"
          style={{ inset: Math.round(size * 0.16) }}
        />
        <span className="relative font-display text-xl font-extrabold text-foreground">
          {Math.round(pct)}%
        </span>
      </div>
    );
  },
);
DonutStat.displayName = "DonutStat";
