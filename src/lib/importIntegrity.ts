export const isActiveClient = (client: { isActive?: boolean }) => client.isActive === true;
export const normalizeVoucherStatus = (status: unknown) => status === "redeemed" || status === "מומש בפועל" ? "מומש סופית" : status === "available" ? "טרם שומש" : status === "issued" ? "הוקצה לעובד" : status;

/** Matching key only; never modify the persisted card number or cast long IDs to Number. */
export function pazCardMatchKey(value: unknown): string {
  const text = String(value ?? "").replace(/[\s\uFEFF]/g, "");
  const integerText = /^\d+\.0+$/.test(text) ? text.split(".")[0] : text;
  return /^\d+$/.test(integerText) ? integerText.replace(/^0+/, "") || "0" : integerText;
}

export function pazFeedbackCardNumbers(rows: unknown[][]): string[] {
  return [...new Set(rows.map(row => pazCardMatchKey(row[0])).filter(Boolean))];
}
export function historicalClientName(voucher: { client?: string; clientId?: string; clientCode?: string; siteId?: string; accountName?: string; standard?: string; route?: string }, regular: { clientId: string; siteId: string; clientName: string }[], b2b: { clientCode: string; accountName: string; standard?: string; clientName: string }[]) {
  if (voucher.client) return voucher.client;
  if (voucher.route === "b2b") return b2b.find(c => c.clientCode === (voucher.clientCode ?? voucher.clientId) && (voucher.standard ? c.standard === voucher.standard : c.accountName === voucher.accountName))?.clientName;
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