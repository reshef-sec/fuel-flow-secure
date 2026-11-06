import { FUEL_TYPES, fuelLabel, type FuelType } from "@/components/fuel/fuel";
import { cardsOfSize, type SizeCounts } from "@/lib/allocationSizes";
import { FACE_VALUES } from "@/lib/issuanceInventory";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { fieldClass, fieldBadClass } from "./AllocationForm";

const fmt = (n: number) => n.toLocaleString("he-IL");

/** One count field per face value and fuel: "how many cards of each size go in this allocation". */
export function SizePicker({
  idPrefix,
  counts,
  onCounts,
  pools,
}: {
  idPrefix: string;
  counts: SizeCounts;
  onCounts: (c: SizeCounts) => void;
  pools: Record<FuelType, { amount: number }[]>;
}) {
  return (
    <div className="grid gap-4 min-[600px]:grid-cols-2">
      {FUEL_TYPES.map((f) => {
        const subtotal = FACE_VALUES[f].reduce((t, size) => t + (Number(counts[f][size]) || 0) * size, 0);
        return (
          <fieldset key={f} className="m-0 flex min-w-0 flex-col gap-2.5 rounded-[14px] border border-line bg-[#fbfcfe] p-3.5">
            <legend className="px-1 text-[13.5px] font-bold text-navy-900">{fuelLabel(f)}</legend>
            {FACE_VALUES[f].map((size) => {
              const id = `${idPrefix}-${f === "בנזין" ? "petrol" : "diesel"}-${size}`;
              const have = cardsOfSize(pools[f], size);
              const over = (Number(counts[f][size]) || 0) > have;
              return (
                <div key={size} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5">
                  <label htmlFor={id} className="ds-num text-[15px] font-bold text-navy-900">{size} ₪</label>
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="0"
                    aria-label={`כמות שוברים של ${size} ₪ ${fuelLabel(f)}`}
                    value={counts[f][size] ?? ""}
                    onChange={(e) => onCounts({ ...counts, [f]: { ...counts[f], [size]: e.target.value } })}
                    aria-invalid={over ? true : undefined}
                    className={cn(fieldClass, "ds-num", over && fieldBadClass)}
                  />
                  <span className={cn("col-start-2 text-[12px] font-medium", over ? "font-bold text-red-700" : "text-slate-600")}>
                    {over ? `יש רק ${fmt(have)} שוברים` : `זמינים: ${fmt(have)} שוברים`}
                  </span>
                </div>
              );
            })}
            <span className="ds-num border-t border-table-line pt-2 text-[13px] font-semibold text-available-fg">
              סה״כ {fuelLabel(f)}: {fmt(subtotal)} ₪
            </span>
          </fieldset>
        );
      })}
    </div>
  );
}
