type VehicleKey = { standard: string; clientCode: string };
export const workVehicleKey = (row: VehicleKey) => JSON.stringify([row.standard.trim(), row.clientCode.trim()]);

/** A complete snapshot: invalid nonblank identities fail before any deactivation. */
export function prepareWorkVehicles<T extends VehicleKey>(input: T[]) {
  const rows: T[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let blanks = 0;
  for (const [index, source] of input.entries()) {
    if (!Object.entries(source).some(([key, value]) => key !== "isActive" && String(value ?? "").trim())) { blanks++; continue; }
    const row = { ...source, standard: source.standard.trim(), clientCode: source.clientCode.trim() };
    if (!row.standard || !row.clientCode) throw new Error(`שורה ${index + 1}: יש למלא תקן וקוד לקוח; המאגר לא שונה`);
    const key = workVehicleKey(row);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    rows.push(row);
  }
  if (!rows.length) throw new Error("לא נמצאו רכבי עבודה תקינים; המאגר לא שונה");
  return { rows, duplicates, blanks };
}