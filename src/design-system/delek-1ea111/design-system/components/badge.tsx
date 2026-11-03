import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-surface-muted text-slate-600",
        info: "bg-blue-100 text-blue-700",
        brand: "bg-navy-100 text-navy-700",
        purple: "bg-violet-100 text-violet-700",
        success: "bg-mint-100 text-teal-600",
        warning: "bg-[color-mix(in_srgb,var(--color-warning)_18%,white)] text-[#8a6210]",
        danger: "bg-[color-mix(in_srgb,var(--color-danger)_14%,white)] text-danger",
        // Redesign 2026 status families (see theme.css): card / link / vehicle / request states.
        available: "bg-available-bg text-available-fg",
        issued: "bg-issued-bg text-issued-fg",
        redeemed: "bg-redeemed-bg text-redeemed-fg",
        pending: "bg-pending-bg text-pending-fg",
        waiting: "bg-waiting-bg text-waiting-fg",
        muted: "bg-neutral-bg text-neutral-fg",
      },
      size: { sm: "px-2 py-0.5 text-xs", md: "px-3 py-1 text-sm" },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/** Compact status or category marker. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />
  ),
);
Badge.displayName = "Badge";

export { badgeVariants };
