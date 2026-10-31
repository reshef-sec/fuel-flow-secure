import type { LucideIcon } from "lucide-react";
import { Button } from "@/design-system/delek-1ea111";

import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

export function Tabs({
  items,
  value,
  onChange,
  scrollable = false,
}: {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  scrollable?: boolean;
}) {
  return (
    <div role="tablist" className={cn("flex min-w-0 max-w-full gap-1 rounded-lg bg-surface-muted p-1", scrollable ? "flex-nowrap overflow-x-auto whitespace-nowrap" : "flex-wrap")}>
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <Button
            type="button"
            variant="ghost"
            key={item.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold outline-none transition-all focus-visible:shadow-focus hover:translate-y-0",
              active
                ? "bg-surface text-primary shadow-card"
                : "text-muted-foreground hover:text-secondary",
            )}
          >
            {Icon ? <Icon className="size-4 shrink-0" /> : null}
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
