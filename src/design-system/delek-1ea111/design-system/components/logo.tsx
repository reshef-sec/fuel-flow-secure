import { forwardRef } from "react";
import { cn } from "../lib/utils";
import colorSrc from "../../assets/logos/brand-color.png";
import reversedSrc from "../../assets/logos/brand-reversed.png";
import emblemSrc from "../../assets/logos/brand-emblem.png";
import emblemReversedSrc from "../../assets/logos/brand-emblem-reversed.png";

export type LogoVariant = "color" | "reversed" | "emblem" | "emblem-reversed";

export interface LogoProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * - `color` (default): full-colour lockup for light surfaces.
   * - `reversed`: white wordmark for navy surfaces (sidebar, top bar, auth brand panel).
   * - `emblem`: the ring mark only (colour).
   * - `emblem-reversed`: the ring mark for navy surfaces (hero watermark).
   */
  variant?: LogoVariant;
}

const sources: Record<LogoVariant, string> = {
  color: colorSrc,
  reversed: reversedSrc,
  emblem: emblemSrc,
  "emblem-reversed": emblemReversedSrc,
};

const sizes = { sm: "h-8", md: "h-12", lg: "h-16", xl: "h-24" } as const;

/** The Reshef Bitachon brand lockup. Never redraw or recolor it — pick a variant. */
export const Logo = forwardRef<HTMLImageElement, LogoProps>(
  ({ className, size = "md", variant = "color", alt = "רשף ביטחון", ...props }, ref) => (
    <img
      ref={ref}
      src={sources[variant]}
      alt={alt}
      className={cn("block w-auto object-contain", sizes[size], className)}
      {...props}
    />
  ),
);
Logo.displayName = "Logo";

/** Raw asset URLs, for places that need an <img src> directly (e.g. decorative watermark). */
export const logoAssets = sources;
