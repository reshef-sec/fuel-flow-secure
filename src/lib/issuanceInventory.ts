export type IssuanceFuel = "בנזין" | "סולר";
export const issuanceAmountRules = (fuel: IssuanceFuel | "") => fuel === "סולר"
  ? { min: 50, step: 50, hint: "בכפולות של 50 ₪ עבור סולר" }
  : { min: 50, step: 50, hint: "בכפולות של 50 ₪" };
export function issuanceAmountError(fuel: IssuanceFuel, amount: number): string | null {
  const { min, step, hint } = issuanceAmountRules(fuel);
  return !Number.isSafeInteger(amount) || amount < min || amount % step !== 0
    ? `הסכום חייב להיות ${hint} (מינימום ${min} ₪)` : null;
}
export const DIESEL_SHORTAGE = "אין מספיק מלאי סולר זמין במאגר להפקת השובר";
export function fuelStockError(fuel: IssuanceFuel, requested: number, stock: { amount: number }[]) {
  if (requested > 0 && (!stock.length || stock.reduce((sum, v) => sum + v.amount, 0) < requested))
    return fuel === "סולר" ? DIESEL_SHORTAGE : "אין מספיק מלאי בנזין זמין במאגר להפקת השובר";
  return null;
}