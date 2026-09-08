import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

export interface TabItem {
  id: string;
  label: string;
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-lg bg-surface-muted p-1">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-semibold outline-none transition-colors focus-visible:shadow-focus",
              active
                ? "bg-surface text-primary shadow-card"
                : "text-muted-foreground hover:text-secondary",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
