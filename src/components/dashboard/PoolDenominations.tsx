import { Card } from "@/design-system/delek-1ea111";
import { FUEL_TYPES, FuelIcon, fuelLabel } from "@/components/fuel/fuel";
import type { CentralInventorySummary } from "@/lib/centralInventorySummary";
import { poolDenominations } from "@/lib/poolDenominations";

/** Count of available central-pool cards per fuel type and face value. */
export function PoolDenominations({ summary, error }: { summary: CentralInventorySummary | null; error?: string | null }) {
  const rows = summary?.denominations;
  return (
    <Card className="py-4">
      <p className="mb-3 text-sm font-semibold text-muted-foreground">כרטיסים זמינים במאגר המרכזי לפי ערך</p>
      {!rows ? <p className="text-sm text-muted-foreground">{error ?? "טוען פירוט מלאי…"}</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">אין כרטיסים זמינים במאגר המרכזי</p> : (
      <div className="grid gap-3 sm:grid-cols-2">
        {FUEL_TYPES.map((f) => {
          const { visible, unexpectedTotal } = poolDenominations(rows, f);
          return (
          <div key={f} className="rounded-lg bg-surface-muted p-3">
            <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-secondary">
              <FuelIcon fuel={f} className="size-4" />
              {fuelLabel(f)}
            </p>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
              {visible.map((row) => (
                <div key={row.amount} className="rounded-md bg-surface px-2 py-2">
                  <p className="text-xs text-muted-foreground">{row.amount.toLocaleString("he-IL")} ₪</p>
                  <p className="font-display text-xl font-extrabold tabular-nums text-secondary">{row.count}</p>
                </div>
              ))}
            </div>
            {visible.length === 0 ? <p className="text-xs text-muted-foreground">אין כרטיסים זמינים בערכים המוצגים</p> : null}
            {unexpectedTotal > 0 ? <p className="mt-2 text-xs text-destructive" role="status">נמצאו במלאי ערכי סולר שאינם 50, 100 או 500 ₪, בסך {unexpectedTotal.toLocaleString("he-IL")} ₪; נכללים ביתרה ומצריכים בדיקה.</p> : null}
          </div>
        );})}
      </div>
      )}
    </Card>
  );
}
