import type { LucideIcon } from "lucide-react";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Tabs — segmented control on a light-grey track (design: Components.dc.html `.tabs`).
 * API unchanged. Scrolls horizontally on mobile (44px touch targets); `scrollable` forces it on desktop too.
 *
 *   <Tabs items={[{ id: "users", label: "משתמשים" }]} value={tab} onChange={setTab} />
 */
export function Tabs({
  items,
  value,
  onChange,
  scrollable = false,
  label,
}: {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  scrollable?: boolean;
  /** Optional accessible name for the tablist. */
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("ds-tabs", scrollable ? "flex-nowrap overflow-x-auto" : "flex-wrap")}>
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className="ds-tab"
          >
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
