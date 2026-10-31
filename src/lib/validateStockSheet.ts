const HEADERS = ["מספר כרטיס", "קוד", "ערך", "סוג", "תוקף"];
const norm = (s: string) => s.replace(/["'״׳]/g, "").replace(/\s+/g, " ").trim();

/**
 * Strictly validates a voucher stock sheet (A מספר כרטיס, B קוד, C ערך, D סוג, E תוקף).
 * Returns data rows (header removed) or a Hebrew reason; any bad row rejects the whole file.
 */
export function validateStockSheet(rows: string[][], existing: Set<string> = new Set()): string[][] | string {
  const header = rows[0];
  if (!header) return "הקובץ ריק.";
  for (let i = 0; i < HEADERS.length; i++)
    if (norm(header[i] ?? "") !== HEADERS[i])
      return `עמודה ${String.fromCharCode(65 + i)} חייבת להיות "${HEADERS[i]}".`;
  const data = rows.slice(1).filter((r) => r.some((c) => c.trim()));
  if (!data.length) return "לא נמצאו שורות נתונים.";
  const seen = new Set<string>();
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    const line = `שורה ${i + 2}: `;
    const serial = (r[0] ?? "").trim();
    if (!/^[\w-]+$/.test(serial)) return `${line}מספר כרטיס חסר או לא תקין.`;
    if (seen.has(serial) || existing.has(serial)) continue;
    seen.add(serial);
    if (!(r[1] ?? "").trim()) return `${line}קוד חסר.`;
    const amount = Number((r[2] ?? "").replace(/[₪,\s]/g, ""));
    if (!Number.isInteger(amount) || amount <= 0 || amount % 50 !== 0) return `${line}ערך חייב להיות מספר בכפולות של 50 ₪.`;
    if (!/בנזין|סולר|דיזל|diesel|benzin|petrol/i.test(r[3] ?? "")) return `${line}סוג דלק חייב להיות "בנזין 95" או "סולר".`;
    const exp = (r[4] ?? "").trim();
    if (exp && Number.isNaN(Date.parse(exp)) && !/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(exp))
      return `${line}תאריך תוקף לא תקין.`;
  }
  return data;
}
