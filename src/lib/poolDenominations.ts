import type { CentralDenomination } from "./centralInventorySummary";

const dieselValues = new Set([50, 100, 500]);

export function poolDenominations(rows: CentralDenomination[], fuel: CentralDenomination["fuel_type"]) {
  const fuelRows = rows.filter(row => row.fuel_type === fuel);
  const visible = fuelRows.filter(row => fuel !== "סולר" || dieselValues.has(row.amount)).sort((a, b) => a.amount - b.amount);
  const unexpectedTotal = fuelRows.filter(row => fuel === "סולר" && !dieselValues.has(row.amount)).reduce((total, row) => total + row.amount * row.count, 0);
  return { visible, unexpectedTotal };
}