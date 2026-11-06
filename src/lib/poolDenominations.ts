import type { CentralDenomination } from "./centralInventorySummary";
import { FACE_VALUES } from "./issuanceInventory";

const dieselValues = new Set(FACE_VALUES["סולר"]);

export function poolDenominations(rows: CentralDenomination[], fuel: CentralDenomination["fuel_type"]) {
  const fuelRows = rows.filter(row => row.fuel_type === fuel);
  const visible = fuelRows.filter(row => fuel !== "סולר" || dieselValues.has(row.amount)).sort((a, b) => a.amount - b.amount);
  const unexpectedTotal = fuelRows.filter(row => fuel === "סולר" && !dieselValues.has(row.amount)).reduce((total, row) => total + row.amount * row.count, 0);
  return { visible, unexpectedTotal };
}