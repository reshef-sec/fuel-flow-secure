/**
 * The signed voucher on this device (localStorage, key voucher_<token>): a repeat visit opens from
 * here with no server call and no new SMS. Holds the device session, the signature and the cards;
 * codes appear only once they were revealed. Storage can be missing or blocked, so every access is
 * guarded and the page falls back to the server.
 */
export interface CachedCode { serial: string; realCode: string; amount: number; fuelType?: "בנזין" | "סולר"; revealed: boolean }
export interface VoucherCache {
  session: string;
  employeeName: string;
  total: number;
  signature: string | null;
  signedAt: string;
  codes: CachedCode[];
}

const keyOf = (token: string) => `voucher_${token}`;

export function readVoucherCache(token: string): VoucherCache | null {
  try {
    const raw = window.localStorage.getItem(keyOf(token));
    const value = raw ? (JSON.parse(raw) as VoucherCache) : null;
    return value?.session && Array.isArray(value.codes) ? value : null;
  } catch {
    return null;
  }
}

export function writeVoucherCache(token: string, value: VoucherCache) {
  try {
    window.localStorage.setItem(keyOf(token), JSON.stringify(value));
  } catch {
    /* no storage: the next visit asks the server again */
  }
}
