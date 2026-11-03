import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { statusDisplay, type StatusTone } from "@/lib/statusDisplay";

const toneClass: Record<StatusTone, { pill: string; dot: string }> = {
  available: { pill: "bg-available-bg text-available-fg", dot: "bg-available" },
  issued: { pill: "bg-issued-bg text-issued-fg", dot: "bg-issued" },
  redeemed: { pill: "bg-redeemed-bg text-redeemed-fg", dot: "bg-redeemed" },
  pending: { pill: "bg-pending-bg text-pending-fg", dot: "bg-pending" },
  waiting: { pill: "bg-waiting-bg text-waiting-fg", dot: "bg-waiting" },
  muted: { pill: "bg-neutral-bg text-neutral-fg", dot: "bg-neutral" },
};

/**
 * StatusBadge — pill with a coloured dot for any stored status value.
 * Cards: "טרם שומש" shows as "זמין" (green), "הוקצה לעובד" orange, "מומש סופית" red.
 * Links: ממתין לחתימה / נחתם / נעול. Vehicles: פעיל / לא פעיל. Requests: ממתין לאישור / אושר / נדחה.
 * Unknown/legacy values (e.g. "חסום") render in neutral grey with their own text — data is never hidden.
 *
 *   <StatusBadge status={voucher.status} />
 *   <StatusBadge status="פעיל" size="sm" />
 *   <StatusBadge status={x} label="תווית מותאמת" />   // override the text, keep the colour
 */
export function StatusBadge({
  status,
  label,
  size = "md",
  className,
}: {
  status: string | null | undefined;
  /** Optional text override; colour still follows `status`. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const d = statusDisplay(status);
  const t = toneClass[d.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] whitespace-nowrap rounded-pill font-bold",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-[11px] py-1 text-[12.5px]",
        t.pill,
        className,
      )}
    >
      <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", t.dot)} />
      {label ?? d.label}
    </span>
  );
}
