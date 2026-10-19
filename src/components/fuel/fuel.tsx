import { Fuel } from "lucide-react";
import { FormField, Input } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

export type FuelType = "בנזין" | "סולר";
export const FUEL_TYPES: FuelType[] = ["בנזין", "סולר"];
export const DEFAULT_FUEL: FuelType = "בנזין";

/** Normalizes free text ("בנזין 95", "דיזל", "Diesel") into a system fuel type. */
export function parseFuelType(raw: unknown): FuelType {
  const t = String(raw ?? "").trim().toLowerCase();
  if (/סולר|דיזל|diesel|solar/.test(t)) return "סולר";
  return "בנזין";
}

export const fuelOf = (v: { fuelType?: FuelType }): FuelType => v.fuelType ?? DEFAULT_FUEL;
export const fuelLabel = (f: FuelType) => (f === "בנזין" ? "בנזין 95" : "סולר");

/** Unified Lucide fuel icon: green for petrol, amber for diesel. */
export function FuelIcon({ fuel, className }: { fuel?: FuelType; className?: string }) {
  return (
    <Fuel
      aria-hidden
      className={cn("size-3.5 shrink-0", (fuel ?? DEFAULT_FUEL) === "בנזין" ? "text-success" : "text-warning", className)}
    />
  );
}

/** Green badge for petrol, blue for diesel. */
export function FuelBadge({ fuel, size = "sm" }: { fuel?: FuelType; size?: "sm" | "lg" }) {
  const f = fuel ?? DEFAULT_FUEL;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-bold",
        size === "lg" ? "px-4 py-1.5 text-lg" : "px-2.5 py-0.5 text-xs",
        f === "בנזין"
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/40 bg-warning/10 text-warning",
      )}
    >
      <FuelIcon fuel={f} className={size === "lg" ? "size-5" : undefined} />
      {fuelLabel(f)}
    </span>
  );
}

/** Sum of amounts per fuel type. */
export function fuelTotals(list: { amount: number; fuelType?: FuelType }[]) {
  const t = { "בנזין": 0, "סולר": 0 } as Record<FuelType, number>;
  for (const v of list) t[fuelOf(v)] += v.amount;
  return t;
}

/** "בנזין: ₪X | סולר: ₪Y" breakdown line with fuel icons. */
export function FuelBreakdown({
  list,
  className,
}: {
  list: { amount: number; fuelType?: FuelType }[];
  className?: string;
}) {
  const t = fuelTotals(list);
  return (
    <p className={cn("flex flex-wrap items-center text-xs font-semibold text-muted-foreground tabular-nums", className)}>
      <span className="inline-flex items-center gap-1"><FuelIcon fuel="בנזין" />בנזין: ₪{t["בנזין"].toLocaleString("he-IL")}</span>
      <span className="mx-1.5">|</span>
      <span className="inline-flex items-center gap-1"><FuelIcon fuel="סולר" />סולר: ₪{t["סולר"].toLocaleString("he-IL")}</span>
    </p>
  );
}

/** Two amount inputs (petrol + diesel) with a live combined total. */
export function FuelSplitFields({
  values,
  onChange,
  available,
}: {
  values: Record<FuelType, string>;
  onChange: (v: Record<FuelType, string>) => void;
  /** Optional per-type availability hint. */
  available?: Record<FuelType, number>;
}) {
  const total = FUEL_TYPES.reduce((t, f) => t + (Number(values[f]) || 0), 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {FUEL_TYPES.map((f) => (
          <FormField
            key={f}
            label={<span className="inline-flex items-center gap-1.5"><FuelIcon fuel={f} className="size-4" />{fuelLabel(f)} (₪)</span>}
            hint={
              available
                ? `זמין: ${available[f].toLocaleString("he-IL")} ₪ · בכפולות של 50 ₪`
                : "בכפולות של 50 ₪"
            }
          >
            <Input
              aria-label={`סכום ${f}`}
              type="number"
              min={0}
              step={50}
              inputMode="numeric"
              value={values[f]}
              onChange={(e) => onChange({ ...values, [f]: e.target.value })}
              disabled={available ? available[f] === 0 : false}
              placeholder={available && available[f] === 0 ? "אין מלאי" : "0"}
              className="tabular-nums"
            />
          </FormField>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-surface-muted px-4 py-2.5">
        <span className="text-sm font-semibold text-muted-foreground">סה״כ הקצאה משולבת</span>
        <span className="font-display text-lg font-extrabold tabular-nums text-secondary">
          {total.toLocaleString("he-IL")} ₪
        </span>
      </div>
    </div>
  );
}

/** Validates a split; returns error text or the numeric amounts. */
export function readSplit(values: Record<FuelType, string>): string | Record<FuelType, number> {
  const out = { "בנזין": Number(values["בנזין"]) || 0, "סולר": Number(values["סולר"]) || 0 };
  if (out["בנזין"] < 0 || out["סולר"] < 0) return "סכום לא תקין";
  if (out["בנזין"] + out["סולר"] <= 0) return "יש להזין סכום לפחות לסוג דלק אחד";
  if (out["בנזין"] % 50 || out["סולר"] % 50) return "הסכומים חייבים להיות בכפולות של 50 ₪";
  return out;
}

export const emptySplit = (): Record<FuelType, string> => ({ "בנזין": "", "סולר": "" });
