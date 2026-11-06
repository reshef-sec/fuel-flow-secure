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
export const sizesFor = (fuel: IssuanceFuel, stock: SizeStock | null) =>
  [...new Set([...FACE_VALUES[fuel], ...Object.keys(stock?.[fuel] ?? {}).map(Number)])].sort((a, b) => a - b);

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

/** Saved sizes back into form fields. */
export function countsFromSizes(sizes: FuelSizes | undefined): SizeCounts {
  const counts = emptySizeCounts();
  for (const fuel of FUELS) for (const [size, n] of Object.entries(sizes?.[fuel] ?? {})) counts[fuel][Number(size)] = String(n);
  return counts;
}

/** "3×500 + 2×50" */
export const sizesText = (sizes: Record<number, number> | undefined) =>
  Object.entries(sizes ?? {}).filter(([, n]) => n).sort((a, b) => Number(b[0]) - Number(a[0])).map(([size, n]) => `${n}×${size}`).join(" + ");

const sizesAmount = (sizes: Record<number, number> | undefined) =>
  Object.entries(sizes ?? {}).reduce((t, [size, n]) => t + Number(size) * n, 0);

export const fuelSizesAmount = (sizes: FuelSizes) => FUELS.reduce((t, f) => t + sizesAmount(sizes[f]), 0);

export const fitsStock = (sizes: FuelSizes, stock: SizeStock) =>
  FUELS.every((f) => Object.entries(sizes[f] ?? {}).every(([size, n]) => n <= (stock[f][Number(size)] ?? 0)));

/** Takes the largest cards that fit into `left`, out of `have`. Returns what could not be covered. */
function topUp(left: number, have: Record<number, number>, cards: Record<number, number>) {
  for (const size of Object.keys(have).map(Number).sort((a, b) => b - a)) {
    const n = Math.min(have[size], Math.floor(left / size));
    if (n <= 0) continue;
    cards[size] = (cards[size] ?? 0) + n;
    have[size] -= n;
    left -= n * size;
  }
  return left;
}

/** One fuel: the requested cards that exist, then other sizes up to the same amount. */
function alternativeCards(amount: number, wanted: Record<number, number> | undefined, available: Record<number, number>) {
  const kept: Record<number, number> = {};
  const rest = { ...available };
  let left = amount;
  for (const [key, n] of Object.entries(wanted ?? {})) {
    const size = Number(key);
    const take = Math.min(n, rest[size] ?? 0);
    if (take <= 0) continue;
    kept[size] = take;
    rest[size] -= take;
    left -= take * size;
  }
  left = topUp(left, rest, kept);
  if (left === 0) return kept;
  // Keeping a small requested card can block the exact amount, so also try from scratch.
  const fresh: Record<number, number> = {};
  return topUp(amount, { ...available }, fresh) < left ? fresh : kept;
}

/** What stock can give for a request, per fuel: the same amount when possible, otherwise as close as it gets. */
export function alternativeApproval(
  request: { sizes?: FuelSizes; benzineAmount?: number; dieselAmount?: number; amount: number },
  stock: SizeStock,
): FuelSizes {
  const { sizes } = request;
  const split = request.benzineAmount || request.dieselAmount;
  const target = (f: IssuanceFuel) => {
    if (sizes) return sizesAmount(sizes[f]);
    if (split) return (f === "סולר" ? request.dieselAmount : request.benzineAmount) ?? 0;
    return f === "סולר" ? 0 : request.amount;
  };
  return {
    "בנזין": alternativeCards(target("בנזין"), sizes?.["בנזין"], stock["בנזין"]),
    "סולר": alternativeCards(target("סולר"), sizes?.["סולר"], stock["סולר"]),
  };
}

export interface SizeSelection { sizes: FuelSizes; split: Record<IssuanceFuel, number> }

/** Validates the counts: the selection, or a Hebrew reason. `stock` null = a request, not limited by stock. */
export function readSizeCounts(counts: SizeCounts, stock: SizeStock | null): SizeSelection | string {
  const sizes: FuelSizes = { "בנזין": {}, "סולר": {} };
  const split: Record<IssuanceFuel, number> = { "בנזין": 0, "סולר": 0 };
  for (const fuel of FUELS) {
    for (const size of sizesFor(fuel, stock)) {
      const text = (counts[fuel][size] ?? "").trim();
      if (!text) continue;
      const n = Number(text);
      if (!Number.isSafeInteger(n) || n < 0) return "כמות שוברים לא תקינה";
      if (!n) continue;
      if (stock && n > (stock[fuel][size] ?? 0)) return `אין מספיק שוברים של ${size} ₪ ב${fuel === "בנזין" ? "בנזין 95" : "סולר"}`;
      sizes[fuel][size] = n;
      split[fuel] += n * size;
    }
  }
  return split["בנזין"] + split["סולר"] > 0 ? { sizes, split } : "יש להזין כמות שוברים לפחות לגודל אחד";
}
