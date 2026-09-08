import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const alertVariants = cva("flex gap-3 rounded-md border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-blue-300 bg-blue-100 text-blue-700",
      success: "border-mint-300 bg-mint-100 text-teal-600",
      warning: "border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_14%,white)] text-[#8a6210]",
      danger: "border-danger bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] text-danger",
    },
  },
  defaultVariants: { variant: "info" },
});

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
  icon?: React.ReactNode;
}

/** Inline message about the state of a page or form. */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, title, icon, children, ...props }, ref) => (
    <div ref={ref} role="status" className={cn(alertVariants({ variant }), className)} {...props}>
      {icon ? <span aria-hidden className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="flex flex-col gap-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className="opacity-90">{children}</div> : null}
      </div>
    </div>
  ),
);
Alert.displayName = "Alert";

export { alertVariants };
