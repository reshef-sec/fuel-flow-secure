/**
 * Display mapping for every status shown in the UI (redesign 2026).
 * Pure + framework-free so it can be used by React components, Excel exports and tests.
 * Stored values are NEVER changed — only how they are labelled and coloured.
 *
 *   Cards:    טרם שומש → "זמין" (green) · הוקצה לעובד (orange) · מומש סופית (red)
 *             legacy "מומש בפועל" → shown as מומש סופית; legacy "חסום" → neutral grey (never hidden)
 *   Links:    ממתין לחתימה (blue) · נחתם (green) · נעול (red); "פג תוקף" displays as ממתין לחתימה
 *   Vehicles: פעיל (green) · לא פעיל (red)
 *   Requests: ממתין לאישור (amber) · אושר (green) · נדחה (red)
 */
export type StatusTone = "available" | "issued" | "redeemed" | "pending" | "waiting" | "muted";

export interface StatusDisplay {
  label: string;
  tone: StatusTone;
}

const MAP: Record<string, StatusDisplay> = {
  // Cards
  "טרם שומש": { label: "זמין", tone: "available" },
  "זמין": { label: "זמין", tone: "available" },
  "הוקצה לעובד": { label: "הוקצה לעובד", tone: "issued" },
  "מומש סופית": { label: "מומש סופית", tone: "redeemed" },
  "מומש בפועל": { label: "מומש סופית", tone: "redeemed" },
  // Produced links
  "ממתין לחתימה": { label: "ממתין לחתימה", tone: "waiting" },
  "פג תוקף": { label: "ממתין לחתימה", tone: "waiting" },
  "נחתם": { label: "נחתם", tone: "available" },
  "נעול": { label: "נעול", tone: "redeemed" },
  // Vehicles
  "פעיל": { label: "פעיל", tone: "available" },
  "לא פעיל": { label: "לא פעיל", tone: "redeemed" },
  // Requests
  "ממתין לאישור": { label: "ממתין לאישור", tone: "pending" },
  "אושר": { label: "אושר", tone: "available" },
  "נדחה": { label: "נדחה", tone: "redeemed" },
};

/** Label + tone for a stored status. Unknown/legacy values (e.g. "חסום") keep their text in neutral grey. */
export function statusDisplay(status: string | null | undefined): StatusDisplay {
  const key = String(status ?? "").trim();
  return MAP[key] ?? { label: key || "—", tone: "muted" };
}

/** Card statuses offered in filters/legends (stored values, in display order). "חסום" is intentionally absent. */
export const CARD_STATUS_FILTERS = ["טרם שומש", "הוקצה לעובד", "מומש סופית"] as const;

/** Produced-link statuses offered in filters/legends. */
export const LINK_STATUS_FILTERS = ["ממתין לחתימה", "נחתם", "נעול"] as const;

/** Hex colours per tone (bg / dot / fg) — for non-CSS consumers such as Excel exports. */
export const STATUS_TONE_HEX: Record<StatusTone, { bg: string; dot: string; fg: string }> = {
  available: { bg: "#e2f6f1", dot: "#12a08c", fg: "#0b6b5d" },
  issued: { bg: "#fff0e0", dot: "#f08a24", fg: "#9a4a00" },
  redeemed: { bg: "#fde8ea", dot: "#d9414f", fg: "#a01c2c" },
  pending: { bg: "#fff4d9", dot: "#e0a11b", fg: "#8a5a00" },
  waiting: { bg: "#e8f0fd", dot: "#1f5fd0", fg: "#17489f" },
  muted: { bg: "#f1f3f7", dot: "#94a2b8", fg: "#3d4757" },
};
