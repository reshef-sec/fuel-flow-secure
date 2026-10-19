import { Card } from "@/design-system/delek-1ea111";
import { FUEL_TYPES, FuelIcon, fuelLabel, fuelOf } from "@/components/fuel/fuel";

const DENOMS = [50, 100, 500];

/** Count of available central-pool cards per fuel type and face value. */
export function PoolDenominations({ pool }: { pool: { amount: number; fuelType?: "בנזין" | "סולר" }[] }) {
  const count = (f: string, d: number) => pool.filter((v) => fuelOf(v) === f && v.amount === d).length;
  return (
    <Card className="py-4">
      <p className="mb-3 text-sm font-semibold text-muted-foreground">כרטיסים זמינים במאגר המרכזי לפי ערך</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FUEL_TYPES.map((f) => (
          <div key={f} className="rounded-lg bg-surface-muted p-3">
            <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-secondary">
              <FuelIcon fuel={f} className="size-4" />
              {fuelLabel(f)}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {DENOMS.map((d) => (
                <div key={d} className="rounded-md bg-surface px-2 py-2">
                  <p className="text-xs text-muted-foreground">{d} ₪</p>
                  <p className="font-display text-xl font-extrabold tabular-nums text-secondary">{count(f, d)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
