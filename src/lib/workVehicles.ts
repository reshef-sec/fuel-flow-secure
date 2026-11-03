type VehicleKey = { standard: string; clientCode: string };
export const workVehicleKey = (row: VehicleKey) => JSON.stringify([row.standard.trim(), row.clientCode.trim()]);

/** Valid keys form the complete snapshot; an all-invalid upload never deactivates stock. */
export function prepareWorkVehicles<T extends VehicleKey>(input: T[]) {
  const rows: T[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let blanks = 0;
  let invalid = 0;
  for (const source of input) {
    if (!Object.entries(source).some(([key, value]) => key !== "isActive" && String(value ?? "").trim())) { blanks++; continue; }
    const row = { ...source, standard: String(source.standard ?? "").trim(), clientCode: String(source.clientCode ?? "").trim() };
    if (!row.standard || !row.clientCode) { invalid++; continue; }
    const key = workVehicleKey(row);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    rows.push(row);
  }
  if (!rows.length) throw new Error("לא נמצאו רכבי עבודה תקינים; המאגר לא שונה");
  return { rows, duplicates, blanks, invalid, skipped: blanks + invalid };
}