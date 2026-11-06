/**
 * Allocation by voucher size: the admin states how many cards of each face value to send, per fuel,
 * all in one allocation. Pure logic (no UI, no store) so it can be tested directly.
 */
import { FACE_VALUES, type IssuanceFuel } from "./issuanceInventory";

const FUELS = ["בנזין", "סולר"] as const;
/** Raw text of each count field: counts[fuel][faceValue]. */
export type SizeCounts = Record<IssuanceFuel, Record<number, string>>;
export type FuelSizes = Record<IssuanceFuel, Record<number, number>>;
/** Cards available per fuel and face value. */
export type SizeStock = Record<IssuanceFuel, Record<number, number>>;

export const emptySizeCounts = (): SizeCounts => ({ "בנזין": {}, "סולר": {} });

/** Stock from the server's central inventory summary, so it is right before the full card list loads. */
export function stockFromSummary(rows: { amount: number; fuel_type: IssuanceFuel; count: number }[] | undefined): SizeStock {
  const stock: SizeStock = { "בנזין": {}, "סולר": {} };
  for (const r of rows ?? []) stock[r.fuel_type][r.amount] = r.count;
  return stock;
}

/** The standard sizes, plus any other face value that really exists in stock (never hidden). */
export const sizesFor = (fuel: IssuanceFuel, stock: SizeStock) =>
  [...new Set([...FACE_VALUES[fuel], ...Object.keys(stock[fuel]).map(Number)])].sort((a, b) => a - b);

/** Exactly the requested number of cards of each face value (each card once), or null when a size runs short. */
export function pickBySize<T extends { amount: number }>(pool: T[], sizes: Record<number, number>): T[] | null {
  const picked: T[] = [];
  for (const [size, count] of Object.entries(sizes)) {
    if (!count) continue;
    const cards = pool.filter((c) => c.amount === Number(size));
    if (cards.length < count) return null;
    picked.push(...cards.slice(0, count));
  }
  return picked.length ? picked : null;
}

export interface SizeSelection { sizes: FuelSizes; split: Record<IssuanceFuel, number> }

/** Validates the counts against the stock: the selection, or a Hebrew reason. */
export function readSizeCounts(counts: SizeCounts, stock: SizeStock): SizeSelection | string {
  const sizes: FuelSizes = { "בנזין": {}, "סולר": {} };
  const split: Record<IssuanceFuel, number> = { "בנזין": 0, "סולר": 0 };
  for (const fuel of FUELS) {
    for (const size of sizesFor(fuel, stock)) {
      const text = (counts[fuel][size] ?? "").trim();
      if (!text) continue;
      const n = Number(text);
      if (!Number.isSafeInteger(n) || n < 0) return "כמות שוברים לא תקינה";
      if (!n) continue;
      if (n > (stock[fuel][size] ?? 0)) return `אין מספיק שוברים של ${size} ₪ ב${fuel === "בנזין" ? "בנזין 95" : "סולר"}`;
      sizes[fuel][size] = n;
      split[fuel] += n * size;
    }
  }
  return split["בנזין"] + split["סולר"] > 0 ? { sizes, split } : "יש להזין כמות שוברים לפחות לגודל אחד";
}
