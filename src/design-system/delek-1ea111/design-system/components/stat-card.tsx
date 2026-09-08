import { forwardRef } from "react";
import { cn } from "../lib/utils";
import { Card } from "./card";
import { DonutStat } from "./progress";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  percent?: number;
  tone?: "primary" | "accent" | "secondary";
}

/** KPI tile: headline figure with an optional ring gauge. */
export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, caption, percent, tone = "primary", ...props }, ref) => (
    <Card
      ref={ref}
      className={cn("flex items-center justify-between gap-4", className)}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted-foreground">{label}</span>
        <span className="font-display text-3xl font-extrabold tabular-nums text-secondary">
          {value}
        </span>
        {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
      </div>
      {percent !== undefined ? <DonutStat value={percent} size={88} tone={tone} /> : null}
    </Card>
  ),
);
StatCard.displayName = "StatCard";
