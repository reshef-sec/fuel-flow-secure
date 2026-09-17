/**
 * Reads a real xlsx/xls/csv/tsv/txt file into rows of strings.
 * Header row is returned as the first row (not stripped).
 */
export async function parseSheetFile(file: File): Promise<string[][]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const first = wb.SheetNames[0];
    if (!first) return [];
    const sheet = wb.Sheets[first];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
    return rows.map((r) => r.map((c) => String(c ?? "").trim()));
  }

  const text = (await file.text()).replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = lines[0]?.includes("\t") ? "\t" : ",";
  return lines.map((line) => splitLine(line, delimiter));
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t") return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  out.push(current.trim());
  return out;
}

/** Drops a header row when its first cell is not numeric data. */
export function stripHeader(rows: string[][], headerHint: string): string[][] {
  const first = rows[0];
  if (first && first.some((c) => c.includes(headerHint))) return rows.slice(1);
  return rows;
}

export const isSheetFile = (name: string) => /\.(xlsx|xls|csv|tsv|txt)$/i.test(name);
