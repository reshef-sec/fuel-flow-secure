/** JS ports of the canonical_* SQL helpers (see database/*.sql). */

export const MAIN_POOL = "מאגר ראשי";
export const CENTRAL_LABEL = "מאגר מרכזי";
export const STATUS = {
  AVAILABLE: "טרם שומש",
  ISSUED: "הוקצה לעובד",
  REDEEMED: "מומש סופית",
  BLOCKED: "חסום",
};

/** 'סניף X (מפקח Y)' → 'X'; '' / מאגר ראשי / מאגר מרכזי → 'מאגר מרכזי'. */
export function canonicalBranch(p) {
  const x = String(p ?? "").trim().replace(/^סניף\s+/, "").replace(/(\s*\([^)]*\))+\s*$/, "").trim();
  return x === "" || x === MAIN_POOL || x === CENTRAL_LABEL ? CENTRAL_LABEL : x;
}

export function canonicalFuel(p) {
  return /(סולר|דיזל|diesel|solar)/i.test(String(p ?? "")) ? "סולר" : "בנזין";
}

/** Card holder name: explicit supervisor, else the '(מפקח X)' suffix of the branch label. */
export function cardHolder(supervisor, branch) {
  const s = String(supervisor ?? "").replace(/\s+/g, " ").trim();
  if (s) return s;
  const m = String(branch ?? "").match(/\(([^()]*)\)/);
  const h = m ? m[1].replace(/^מפקח\s+/, "").replace(/\s+/g, " ").trim() : "";
  return h || null;
}

/** Denomination rules: petrol cards 50/100/500 (50 ₪ steps), diesel cards 100/500 (100 ₪ steps). */
export function denominationStep(fuel) {
  return canonicalFuel(fuel) === "סולר" ? 100 : 50;
}
export function isValidDenomination(fuel, amount) {
  const n = Number(amount);
  return Number.isInteger(n) && n > 0 && n % denominationStep(fuel) === 0;
}

/**
 * Exact port of paz_card_match_key(): strip NBSP/BOM/whitespace, turn '123.00'
 * into '123', and strip leading zeros from all-digit values ('000' → '0').
 * Non-numeric values are kept as-is (text-only comparison, never numeric casts).
 */
export function pazMatchKey(value) {
  if (value == null) return null;
  let v = String(value).replace(/[ ﻿]/g, "").replace(/\s/g, "");
  if (/^[0-9]+\.0+$/.test(v)) v = v.split(".")[0];
  if (/^[0-9]+$/.test(v)) return v.replace(/^0+/, "") || "0";
  return v;
}

export const trim = (v) => (v == null ? "" : String(v).replace(/[‎‏‪-‮]/g, "").trim());
