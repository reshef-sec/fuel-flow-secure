export const isActiveClient = (client: { isActive?: boolean }) => client.isActive === true;
export const normalizeVoucherStatus = (status: unknown) => status === "redeemed" ? "מומש בפועל" : status === "available" ? "טרם שומש" : status;
export function historicalClientName(voucher: { client?: string; clientId?: string; clientCode?: string; siteId?: string; accountName?: string; route?: string }, regular: { clientId: string; siteId: string; clientName: string }[], b2b: { clientCode: string; accountName: string; clientName: string }[]) {
  if (voucher.client) return voucher.client;
  if (voucher.route === "b2b") return b2b.find(c => c.clientCode === (voucher.clientCode ?? voucher.clientId) && c.accountName === voucher.accountName)?.clientName;
  return regular.find(c => c.clientId === (voucher.clientId ?? voucher.clientCode) && c.siteId === voucher.siteId)?.clientName;
}
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