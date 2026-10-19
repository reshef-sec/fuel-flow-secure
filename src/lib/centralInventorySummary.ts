import { supabase } from "@/lib/supabaseClient";

export interface CentralInventorySummary {
  total_available_amount: number;
  gasoline_amount: number;
  diesel_amount: number;
}

export function parseCentralInventorySummary(data: unknown): CentralInventorySummary {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("לא התקבלה יתרת מלאי מהענן");
  const raw = row as Record<string, unknown>;
  const amount = (key: string) => {
    const value = raw[key];
    if (value == null || value === "") throw new Error("סיכום המלאי אינו תקין");
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error("סיכום המלאי אינו תקין");
    return number;
  };
  const summary = {
    total_available_amount: amount("total_available_amount"),
    gasoline_amount: amount("gasoline_amount"),
    diesel_amount: amount("diesel_amount"),
  };
  if (Math.abs(summary.total_available_amount - summary.gasoline_amount - summary.diesel_amount) > 0.001)
    throw new Error("סיכום המלאי אינו תואם לפירוט הדלק — יש לבדוק את סוגי הדלק במאגר");
  return summary;
}

export async function fetchCentralInventorySummary(): Promise<CentralInventorySummary> {
  const { data, error } = await supabase.rpc("get_central_inventory_summary");
  if (error) throw new Error("טעינת יתרת המלאי נכשלה — יש לוודא שתסריט SQL הותקן במאגר המחובר לאפליקציה");
  return parseCentralInventorySummary(data);
}

export function notifyCentralInventoryChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("central-inventory-changed"));
}