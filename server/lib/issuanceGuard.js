/**
 * Ports of the BEFORE INSERT / UPDATE OF link_id triggers on public.vouchers:
 *   require_active_issuance_client, require_active_private_vehicle, set_voucher_expiry.
 *
 * Each function takes (row, previousRow, session):
 *   row          the NEW row (merged state that is about to be written)
 *   previousRow  the OLD row for an update, or null/undefined for an insert
 *   session      optional mongoose session, so the lookups read inside the caller's transaction
 * The require_* functions throw the trigger's exact Hebrew RAISE message (HTTP 400);
 * setVoucherExpiry mutates and returns `row`, like a trigger assigning NEW.*.
 */
import { RegularClient, B2BClient } from "../models.js";
import { badRequest } from "../errors.js";
import { STATUS, MAIN_POOL, CENTRAL_LABEL } from "./canonical.js";

const blank = (v) => v == null || v === "";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Postgres btrim(x) = y, as a query on the stored column (btrim strips spaces only). */
const btrimEq = (value) => ({ $regex: `^ *${escapeRe(String(value).replace(/^ +| +$/g, ""))} *$` });

/** Branch name for comparison: trimmed, without a leading "סניף". */
const branchKey = (v) => String(v ?? "").trim().replace(/^סניף\s+/, "").trim();
/**
 * Work-vehicle branch scope: a vehicle with no branch is open to every branch; a vehicle assigned to a
 * branch can be issued only on that branch's cards (central-pool / admin cards may use any vehicle).
 */
export function workVehicleBranchAllowed(vehicleBranch, cardBranch) {
  const v = branchKey(vehicleBranch);
  const c = branchKey(cardBranch);
  // "הנהלה" = issued by the central administration (admin) — not a branch.
  if (!v || !c || c === MAIN_POOL || c === CENTRAL_LABEL || c === "הנהלה") return true;
  return v === c;
}

/** Trigger short-circuit: only the initial assignment of a (new) link_id is checked. */
function linkAssigned(row, previousRow) {
  if (blank(row?.link_id)) return false;
  if (previousRow && (previousRow.link_id ?? null) === (row.link_id ?? null)) return false;
  return true;
}

/**
 * opts.vehicleScope: the issuer's branch for the work-vehicle branch check; null = unrestricted (admin);
 * undefined = use the card's own branch (generic table writes).
 */
export async function requireActiveIssuanceClient(row, previousRow, session, opts = {}) {
  if (!linkAssigned(row, previousRow)) return row;
  if (row.route === "regular") {
    const ok = row.client_id != null && row.site_id != null && await RegularClient.exists({
      client_id: row.client_id, site_id: row.site_id, is_active: true,
    }).session(session ?? null);
    if (!ok) throw badRequest("הלקוח או האתר אינם פעילים");
  } else if (row.route === "b2b") {
    const vehicle = row.client_code != null && row.standard != null ? await B2BClient.findOne({
      client_code: btrimEq(row.client_code), standard: btrimEq(row.standard), is_active: true,
    }, { branch: 1 }).session(session ?? null).lean() : null;
    if (!vehicle) throw badRequest("רכב העבודה אינו פעיל");
    const scope = opts.vehicleScope === undefined ? row.branch : opts.vehicleScope;
    if (scope !== null && !workVehicleBranchAllowed(vehicle.branch, scope)) throw badRequest("רכב העבודה משויך לסניף אחר");
  } else {
    throw badRequest("יש לבחור מאגר לקוחות להנפקה");
  }
  return row;
}

export async function requireActivePrivateVehicle(row, previousRow, session) {
  if (row?.route !== "regular" || !linkAssigned(row, previousRow)) return row;
  const ok = row.client_id != null && row.site_id != null && await RegularClient.exists({
    client_id: btrimEq(row.client_id), site_id: btrimEq(row.site_id), is_active: true,
  }).session(session ?? null);
  if (!ok) throw badRequest("הרכב הפרטי או האתר אינם פעילים");
  return row;
}

/** interval '3 months' (calendar months, clamped to the month's last day). */
export function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

// eslint-disable-next-line no-unused-vars
export function setVoucherExpiry(row, previousRow, session) {
  const now = new Date();
  if (row.status === STATUS.ISSUED && row.issued_at == null) {
    row.issued_at = now;
    row.expires_at = addMonths(now, 3);
  }
  if (row.status != null && row.status !== STATUS.REDEEMED && row.expires_at != null && new Date(row.expires_at) < now) {
    row.status = STATUS.BLOCKED;
  }
  return row;
}

/**
 * Runs all three triggers in Postgres firing order (alphabetical by trigger name) and
 * returns the patch of trigger-assigned columns (status / issued_at / expires_at) that
 * differ from `row`, for the caller to add to its write.
 */
export async function guardVoucherWrite(row, previousRow, session) {
  await requireActiveIssuanceClient(row, previousRow, session);
  await requireActivePrivateVehicle(row, previousRow, session);
  const next = setVoucherExpiry({ ...row }, previousRow, session);
  const patch = {};
  for (const k of ["status", "issued_at", "expires_at"]) if (next[k] !== row[k]) patch[k] = next[k];
  return patch;
}
