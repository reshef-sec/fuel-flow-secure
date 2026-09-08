import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition-all duration-150 outline-none hover:-translate-y-px hover:shadow-card active:translate-y-0 focus-visible:shadow-focus disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-blue-700",
        secondary: "bg-secondary text-secondary-foreground hover:bg-navy-900",
        accent: "bg-accent text-accent-foreground hover:bg-teal-600 hover:text-white",
        outline: "border border-border bg-surface text-foreground hover:bg-surface-muted",
        ghost: "text-primary hover:bg-blue-100",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: {
        sm: "h-8 rounded-sm px-3 text-sm",
        md: "h-10 rounded-md px-4 text-sm",
        lg: "h-12 rounded-md px-6 text-base",
        icon: "size-10 rounded-md",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

/** Primary action control. Renders a real <button>; use a link for navigation. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-pill border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export { buttonVariants };
