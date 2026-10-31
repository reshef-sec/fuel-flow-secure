import { STOCK_SHORTAGE } from "./issuanceInventory";

/** Bounded exact change, using each physical voucher at most once. */
export function pickExact<T extends { amount: number }>(list: T[], amount: number): T[] | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const paths = new Map<number, { card: T; previous: number } | null>();
  paths.set(0, null);
  for (const card of list) {
    if (!Number.isSafeInteger(card.amount) || card.amount <= 0) continue;
    for (const sum of [...paths.keys()].sort((a, b) => b - a)) {
      const next = sum + card.amount;
      if (next > amount || paths.has(next)) continue;
      paths.set(next, { card, previous: sum });
      if (next === amount) {
        const selected: T[] = [];
        let cursor = amount;
        while (cursor > 0) {
          const path = paths.get(cursor);
          if (!path) return null;
          selected.push(path.card);
          cursor = path.previous;
        }
        return selected;
      }
    }
  }
  return null;
}

export function exactStockError(list: { amount: number }[], amount: number) {
  return pickExact(list, amount) ? null : STOCK_SHORTAGE;
}