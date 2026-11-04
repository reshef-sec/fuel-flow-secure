/**
 * Branch stock balances — ONE definition shared by the dashboard ("יתרת תקציב בסניפים") and the
 * allocations page ("יתרות לפי סניף"), so the two can never disagree.
 *
 * Branch stock = every unissued, available card outside the central pool, whether it sits with the
 * branch manager (no holder) or with a supervisor. The balance rows partition that stock exactly:
 * each card is counted in exactly one row, so Σ rows === branchStockTotal.
 */
import { canonicalBranch, canonicalFuel, isCentralBranch, isUnissuedAvailable, stockHolder, type StockCard } from "./issuanceStock";
import { branchLabel } from "./branchLabels";

export interface BalanceUser {
  id: string; firstName: string; lastName: string; role: string; branch: string; canRequest?: boolean;
}
export interface BalanceBranch { id: string; name: string; manager?: string }

export interface BalanceRow {
  key: string;
  name: string;
  role: string;
  roleTone: "branch" | "request" | "plain";
  branch: string;
  petrol: number;
  diesel: number;
}

export const isBranchStock = (v: StockCard) =>
  isUnissuedAvailable(v) && Number(v.amount) > 0 && !isCentralBranch(v.branch);

export const branchStockTotal = (stock: StockCard[]) =>
  stock.filter(isBranchStock).reduce((t, v) => t + Number(v.amount), 0);

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const nameOf = (u: BalanceUser) => clean(`${u.lastName ?? ""} ${u.firstName ?? ""}`);

function roleText(u: BalanceUser) {
  if (u.role === "branch") return "מנהל סניף";
  if (u.role === "supervisor") return u.canRequest ? "מפקח · מורשה דרישה" : "מפקח";
  return u.canRequest ? "מורשה דרישה" : "משתמש";
}
const toneOf = (u: BalanceUser): BalanceRow["roleTone"] => (u.role === "branch" ? "branch" : u.canRequest ? "request" : "plain");

/**
 * One row per holder of branch stock:
 *   - every branch manager / request-authorised user (even at 0 — they are allocation recipients);
 *   - every supervisor who holds stock;
 *   - every branch (its unassigned stock), even without a manager;
 *   - anything left over (e.g. a holder name with no matching user) — never hidden.
 */
export function branchBalanceRows(stock: StockCard[], users: BalanceUser[], branches: BalanceBranch[]): BalanceRow[] {
  const sums = new Map<string, { petrol: number; diesel: number }>();
  const keyOf = (branch: string, holder: string) => `${canonicalBranch(branch)}|${holder}`;
  for (const v of stock) {
    if (!isBranchStock(v)) continue;
    const k = keyOf(v.branch, stockHolder(v));
    const s = sums.get(k) ?? { petrol: 0, diesel: 0 };
    if (canonicalFuel(v.fuelType) === "סולר") s.diesel += Number(v.amount); else s.petrol += Number(v.amount);
    sums.set(k, s);
  }
  const take = (k: string) => {
    const s = sums.get(k) ?? { petrol: 0, diesel: 0 };
    sums.delete(k);
    return s;
  };

  const rows: BalanceRow[] = [];
  const sortUsers = [...users].sort((a, b) =>
    branchLabel(a.branch).localeCompare(branchLabel(b.branch), "he")
    || (a.role === "branch" ? -1 : 0) - (b.role === "branch" ? -1 : 0)
    || nameOf(a).localeCompare(nameOf(b), "he"));
  const managerShown = new Set<string>();
  for (const u of sortUsers) {
    const recipient = u.role === "branch" || (u.canRequest && u.role !== "admin" && u.role !== "viewer");
    const supervisor = u.role === "supervisor";
    if (!recipient && !supervisor) continue;
    const b = canonicalBranch(u.branch);
    if (isCentralBranch(u.branch)) continue;
    // A branch's unassigned stock belongs to its (first) manager; supervisors own what is assigned to them by name.
    const k = supervisor ? keyOf(u.branch, nameOf(u)) : keyOf(u.branch, "");
    if (!supervisor && managerShown.has(b)) {
      if (!recipient) continue;
      rows.push({ key: u.id, name: nameOf(u), role: roleText(u), roleTone: toneOf(u), branch: b, petrol: 0, diesel: 0 });
      continue;
    }
    const has = sums.has(k);
    if (!recipient && !has) continue; // supervisors without stock and without request rights stay off the list
    if (!supervisor) managerShown.add(b);
    rows.push({ key: u.id, name: nameOf(u), role: roleText(u), roleTone: toneOf(u), branch: b, ...take(k) });
  }
  for (const br of branches) {
    const b = canonicalBranch(br.name);
    if (isCentralBranch(br.name) || managerShown.has(b)) continue;
    managerShown.add(b);
    rows.push({ key: `branch-${br.id}`, name: br.manager || "—", role: "סניף", roleTone: "plain", branch: b, ...take(keyOf(br.name, "")) });
  }
  for (const [k, s] of sums) {
    const [b, holder] = k.split("|");
    rows.push({ key: `other-${k}`, name: holder || "מלאי סניף", role: holder ? "מפקח" : "סניף", roleTone: "plain", branch: b, ...s });
  }
  return rows;
}
