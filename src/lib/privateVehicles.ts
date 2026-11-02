type PrivateVehicleKey = { clientId: string; siteId: string };
export const privateVehicleKey = (row: PrivateVehicleKey) => JSON.stringify([row.clientId.trim(), row.siteId.trim()]);

/** Preserve the first occurrence and reject incomplete nonblank snapshots before writes. */
export function preparePrivateVehicles<T extends PrivateVehicleKey>(input: T[]) {
  const rows: T[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let blanks = 0;
  for (const [index, source] of input.entries()) {
    if (!Object.entries(source).some(([key, value]) => key !== "isActive" && String(value ?? "").trim())) { blanks++; continue; }
    const row = { ...source, clientId: source.clientId.trim(), siteId: source.siteId.trim() };
    if (!row.clientId || !row.siteId) throw new Error(`שורה ${index + 1}: יש למלא מספר לקוח ומספר אתר; המאגר לא שונה`);
    const key = privateVehicleKey(row);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    rows.push(row);
  }
  if (!rows.length) throw new Error("לא נמצאו רכבים פרטיים תקינים; המאגר לא שונה");
  return { rows, duplicates, blanks };
}