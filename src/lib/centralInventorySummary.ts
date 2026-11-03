import { api } from "@/lib/apiClient";

export interface CentralInventorySummary {
  total_available_amount: number;
  gasoline_amount: number;
  diesel_amount: number;
  denominations?: CentralDenomination[];
}
export interface CentralDenomination { amount: number; fuel_type: "בנזין" | "סולר"; count: number }

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
  const { data, error } = await api.rpc("get_central_inventory_snapshot");
  if (error) throw new Error("טעינת יתרת המלאי נכשלה — יש לוודא שתסריט SQL הותקן במאגר המחובר לאפליקציה");
  return parseCentralInventorySnapshot(data);
}

export function parseCentralInventorySnapshot(data: unknown): CentralInventorySummary {
  const summary = parseCentralInventorySummary(data);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  if (!Array.isArray(row.denominations)) throw new Error("לא התקבל פירוט ערכי מלאי מהענן");
  const seen = new Set<string>();
  const denominations = row.denominations.map((value): CentralDenomination => {
    if (!value || typeof value !== "object") throw new Error("פירוט ערכי המלאי אינו תקין");
    const raw = value as Record<string, unknown>;
    const amount = Number(raw.amount), count = Number(raw.count);
    const fuel = raw.fuel_type;
    if (raw.amount == null || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(count) || count <= 0 || (fuel !== "בנזין" && fuel !== "סולר"))
      throw new Error("פירוט ערכי המלאי אינו תקין");
    const key = `${fuel}:${amount}`;
    if (seen.has(key)) throw new Error("פירוט ערכי המלאי מכיל כפילויות");
    seen.add(key);
    return { amount, count, fuel_type: fuel };
  }).sort((a, b) => a.amount - b.amount);
  for (const fuel of ["בנזין", "סולר"] as const) {
    const total = denominations.filter(row => row.fuel_type === fuel).reduce((sum, row) => sum + row.amount * row.count, 0);
    if (Math.abs(total - (fuel === "בנזין" ? summary.gasoline_amount : summary.diesel_amount)) > 0.001)
      throw new Error("פירוט ערכי המלאי אינו תואם ליתרה — יש לרענן את המלאי");
  }
  return { ...summary, denominations };
}

export function notifyCentralInventoryChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("central-inventory-changed"));
}