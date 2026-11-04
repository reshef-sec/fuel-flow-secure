/**
 * Use the current deployment origin; relative during SSR, never a hardcoded host.
 * `demo` (learning environment only) appends `?demo=1` so the employee page reads the demo links.
 */
export const publicVoucherUrl = (
  id: string,
  origin = typeof window === "undefined" ? "" : window.location.origin,
  demo = false,
) => `${origin}/voucher/${encodeURIComponent(id)}${demo ? "?demo=1" : ""}`;

/** `?demo=1` → true; anything else (absent, "0", "true", arrays…) → false. */
export const isDemoSearchValue = (value: unknown) => value === 1 || value === "1";
