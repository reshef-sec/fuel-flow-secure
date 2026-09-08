import { forwardRef } from "react";
import { cn } from "../lib/utils";
import logoSrc from "../../assets/logos/reshef-bitachon-logo.jpeg";

export interface LogoProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: "h-8", md: "h-12", lg: "h-16" } as const;

/** The Reshef Bitachon brand lockup. Never redraw or recolor it. */
export const Logo = forwardRef<HTMLImageElement, LogoProps>(
  ({ className, size = "md", alt = "רשף ביטחון", ...props }, ref) => (
    <img
      ref={ref}
      src={logoSrc}
      alt={alt}
      className={cn("w-auto object-contain", sizes[size], className)}
      {...props}
    />
  ),
);
Logo.displayName = "Logo";
