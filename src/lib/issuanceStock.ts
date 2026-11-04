/** Canonical stock matching for employee issuance (browser-safe, mirrors issue_voucher_to_worker SQL). */
import { branchLabel, CENTRAL_POOL_LABEL } from "./branchLabels";

export type CanonicalFuel = "בנזין" | "סולר";

/** "בנזין 95", "בנזין", "95" → בנזין; "סולר", "דיזל", "diesel" → סולר. */
export function canonicalFuel(raw: unknown): CanonicalFuel {
  return /סולר|דיזל|diesel|solar/i.test(String(raw ?? "").trim()) ? "סולר" : "בנזין";
}

/** Strips "סניף " prefix and "(מפקח …)" suffixes; central-pool aliases collapse to one label. */
export const canonicalBranch = (b: string | null | undefined) => branchLabel(b);
export const isCentralBranch = (b: string | null | undefined) => canonicalBranch(b) === CENTRAL_POOL_LABEL;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const embeddedSupervisor = (branch: string) => clean(/\(([^()]*)\)/.exec(branch)?.[1]?.replace(/^מפקח\s+/, ""));

/** Who holds a branch card: the supervisor's name (field or "(מפקח …)" suffix), or "" for the branch itself. */
export const stockHolder = (v: { supervisor?: string; branch: string }) => clean(v.supervisor) || embeddedSupervisor(v.branch);

export interface StockCard {
  serial: string; amount: number | string; branch: string; status: string;
  fuelType?: string; supervisor?: string; linkId?: string; workerId?: string; workerName?: string;
}

export interface Issuer { role: "admin" | "branch" | "supervisor" | "viewer"; branch?: string; supervisorName?: string }

export const isUnissuedAvailable = (v: StockCard) =>
  (v.status === "טרם שומש" || v.status === "available") && !v.linkId && !v.workerId && !v.workerName;

/** Cards the issuer may hand out. Admin → central pool; branch → own unassigned branch stock; supervisor → own stock. */
export function issuancePool<T extends StockCard>(stock: T[], who: Issuer): T[] {
  // The read-only viewer never issues.
  if (who.role === "viewer") return [];
  const myBranch = canonicalBranch(who.branch);
  const me = clean(who.supervisorName);
  return stock.filter((v) => {
    if (!isUnissuedAvailable(v) || !(Number(v.amount) > 0)) return false;
    const holder = stockHolder(v);
    if (who.role === "admin") return isCentralBranch(v.branch) && !holder;
    if (canonicalBranch(v.branch) !== myBranch || isCentralBranch(v.branch)) return false;
    return who.role === "supervisor" ? holder === me && !!me : !holder;
  });
}

export const cardsOfFuel = <T extends StockCard>(pool: T[], fuel: CanonicalFuel) =>
  pool.filter((v) => canonicalFuel(v.fuelType) === fuel).map((v) => ({ ...v, amount: Number(v.amount) }));
