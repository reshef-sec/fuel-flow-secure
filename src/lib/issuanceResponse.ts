import { canonicalFuel } from "./issuanceStock";

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);

/** Accept JSONB directly, and the previous table response during staged deployment. */
export function parseIssuanceResponse(payload: unknown, requestedLinkId: string, itemCount: number) {
  const legacy = Array.isArray(payload);
  const rows = legacy ? payload : isRow(payload) ? payload.vouchers : undefined;
  const linkId = legacy ? requestedLinkId : isRow(payload) ? payload.link_id : undefined;
  if (!Array.isArray(rows) || !rows.length || typeof linkId !== "string" || !/^\d{4,12}$/.test(linkId)) {
    throw new Error("תשובת הנפקה לא תקינה — יש לבדוק את שמירת הלינק");
  }
  const serials = new Set<string>();
  const cards = rows.map(row => {
    if (!isRow(row)) throw new Error("תשובת שובר לא תקינה");
    const serial = row.serial ?? row.card_number;
    const amount = Number(row.amount);
    const itemIndex = Number(row.item_index);
    if (typeof serial !== "string" || !serial.trim() || serials.has(serial) || !Number.isSafeInteger(amount) || amount <= 0 ||
      !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= itemCount || (row.link_id !== undefined && row.link_id !== linkId)) {
      throw new Error("פרטי שובר שהוחזרו אינם תקינים");
    }
    serials.add(serial);
    return { serial, amount, itemIndex, fuelType: canonicalFuel(row.fuel_type) };
  });
  const total = cards.reduce((sum, card) => sum + card.amount, 0);
  if (!legacy && isRow(payload) && Number(payload.total) !== total) throw new Error("סכום תשובת ההנפקה אינו תואם לשוברים");
  return { linkId, total, cards };
}