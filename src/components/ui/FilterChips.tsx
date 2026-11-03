import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

export interface FilterChipItem<T extends string = string> {
  value: T;
  label: string;
  /** Optional count bubble (e.g. rows per status). */
  count?: number;
}

/**
 * FilterChips — single-select pill filters with optional counts (design: Main.dc.html `.chips`).
 * Rendered as toggle buttons (aria-pressed). Scrolls horizontally on mobile instead of wrapping.
 *
 *   <FilterChips label="סינון לפי סטטוס" value={status} onChange={setStatus}
 *     items={[{ value: "all", label: "הכל", count: 120 }, { value: "טרם שומש", label: "זמין", count: 80 }]} />
 */
export function FilterChips<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: readonly FilterChipItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible group name, e.g. "סינון לפי סטטוס". */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("ds-chips ds-chips-scroll", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="ds-chip"
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined ? (
            <span className="ds-chip-n ds-num">{item.count.toLocaleString("he-IL")}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
