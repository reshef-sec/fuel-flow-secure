export const isActiveClient = (client: { isActive?: boolean }) => client.isActive === true;
export const normalizeVoucherStatus = (status: unknown) => status === "redeemed" ? "מומש בפועל" : status === "available" ? "טרם שומש" : status;
export function partitionStockRows(rows: string[][], existing: Set<string>) {
  const seen = new Set(existing);
  const accepted: string[][] = [];
  let skipped = 0;
  for (const row of rows) {
    const serial = String(row[0] ?? "").trim();
    if (seen.has(serial)) { skipped++; continue; }
    seen.add(serial);
    accepted.push(row);
  }
  return { accepted, skipped };
}