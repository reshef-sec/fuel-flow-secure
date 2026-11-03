/** Unicode-safe Hebrew Excel header comparison, without fuzzy substring collisions. */
export const normalizeWorkVehicleHeader = (value: string) => value.normalize("NFKC").trim().replace(/[\p{P}\p{Z}\p{Cf}\s]/gu, "").toLowerCase();

const coreAliases: Record<string, string[]> = {
  standard: ["תקן", "מספר תקן", "מס׳ תקן", "תקן רכב", "מספר רכב", "מס׳ רכב"],
  clientCode: ["קוד לקוח", "קוד הלקוח", "מספר לקוח", "מס׳ לקוח"],
  clientName: ["שם לקוח", "שם הלקוח"],
};

export function parseWorkVehicleSheet<K extends string>(sheet: string[][], columns: readonly { key: K; label: string }[]): Record<K, string>[] {
  const matches = (cell: string, key: string, label: string) => [label, ...(coreAliases[key] ?? [])].filter(Boolean).some(alias => normalizeWorkVehicleHeader(cell) === normalizeWorkVehicleHeader(alias));
  const headerIndex = sheet.slice(0, 5).findIndex(row => Object.keys(coreAliases).every(key => row.some(cell => matches(cell, key, ""))));
  const header = sheet[headerIndex];
  if (headerIndex < 0 || !header) throw new Error("לא נמצאה שורת כותרות בחמש השורות הראשונות; נדרשות העמודות: תקן, קוד לקוח, שם לקוח");
  const positions = columns.map(column => header.findIndex(cell => matches(cell, column.key, column.label)));
  return sheet.slice(headerIndex + 1).map(row => Object.fromEntries(columns.map((column, i) => [column.key, positions[i] >= 0 ? String(row[positions[i]] ?? "").trim() : ""])) as Record<K, string>);
}