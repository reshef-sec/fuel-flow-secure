/** Use the current deployment origin; relative during SSR, never a hardcoded host. */
export const publicVoucherUrl = (id: string, origin = typeof window === "undefined" ? "" : window.location.origin) =>
  `${origin}/voucher/${encodeURIComponent(id)}`;
