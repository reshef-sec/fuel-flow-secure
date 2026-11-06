/**
 * Allocation by voucher size: the admin states how many cards of each face value to send, per fuel,
 * all in one allocation. Pure logic (no UI, no store) so it can be tested directly.
 */
import { FACE_VALUES, type IssuanceFuel } from "./issuanceInventory";

const FUELS = ["בנזין", "סולר"] as const;
/** Raw text of each count field: counts[fuel][faceValue]. */
export type SizeCounts = Record<IssuanceFuel, Record<number, string>>;
export type FuelSizes = Record<IssuanceFuel, Record<number, number>>;

export const emptySizeCounts = (): SizeCounts => ({
  "בנזין": Object.fromEntries(FACE_VALUES["בנזין"].map((v) => [v, ""])),
  "סולר": Object.fromEntries(FACE_VALUES["סולר"].map((v) => [v, ""])),
});

/** How many available cards of `size` the pool holds. */
export const cardsOfSize = (pool: { amount: number }[], size: number) => pool.filter((c) => c.amount === size).length;

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

/** Validates the counts against the pools: the selection, or a Hebrew reason. */
export function readSizeCounts(counts: SizeCounts, pools: Record<IssuanceFuel, { amount: number }[]>): SizeSelection | string {
  const sizes: FuelSizes = { "בנזין": {}, "סולר": {} };
  const split: Record<IssuanceFuel, number> = { "בנזין": 0, "סולר": 0 };
  for (const fuel of FUELS) {
    for (const size of FACE_VALUES[fuel]) {
      const text = (counts[fuel][size] ?? "").trim();
      if (!text) continue;
      const n = Number(text);
      if (!Number.isSafeInteger(n) || n < 0) return "כמות שוברים לא תקינה";
      if (!n) continue;
      if (n > cardsOfSize(pools[fuel], size)) return `אין מספיק שוברים של ${size} ₪ ב${fuel === "בנזין" ? "בנזין 95" : "סולר"}`;
      sizes[fuel][size] = n;
      split[fuel] += n * size;
    }
  }
  return split["בנזין"] + split["סולר"] > 0 ? { sizes, split } : "יש להזין כמות שוברים לפחות לגודל אחד";
}
