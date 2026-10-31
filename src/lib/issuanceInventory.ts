export type IssuanceFuel = "בנזין" | "סולר";
export const issuanceAmountRules = (fuel: IssuanceFuel | "") => fuel === "סולר"
  ? { min: 50, step: 50, hint: "בכפולות של 50 ₪" }
  : { min: 100, step: 100, hint: "בכפולות של 100 ₪" };
export function issuanceAmountError(fuel: IssuanceFuel, amount: number): string | null {
  const { min, step, hint } = issuanceAmountRules(fuel);
  return !Number.isSafeInteger(amount) || amount < min || amount % step !== 0
    ? `הסכום חייב להיות ${hint} (מינימום ${min} ₪)` : null;
}
export const STOCK_SHORTAGE = "אין מספיק מלאי זמין במאגר עבור סוג דלק וסכום זה";
export const DIESEL_SHORTAGE = STOCK_SHORTAGE;
export function fuelStockError(fuel: IssuanceFuel, requested: number, stock: { amount: number }[]) {
  if (requested > 0 && (!stock.length || stock.reduce((sum, v) => sum + v.amount, 0) < requested))
    return STOCK_SHORTAGE;
  return null;
}

export function validateFuelSplit(values: Record<IssuanceFuel, string>): string | Record<IssuanceFuel, number> {
  const out = { "בנזין": Number(values["בנזין"]), "סולר": Number(values["סולר"]) };
  for (const fuel of ["בנזין", "סולר"] as const) {
    if (!Number.isSafeInteger(out[fuel]) || out[fuel] < 0) return "סכום לא תקין";
    if (out[fuel]) {
      const error = issuanceAmountError(fuel, out[fuel]);
      if (error) return error;
    }
  }
  return out["בנזין"] + out["סולר"] > 0 ? out : "יש להזין סכום לפחות לסוג דלק אחד";
}