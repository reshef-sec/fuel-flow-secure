import { FUEL_TYPES, fuelOf, type FuelType } from "@/components/fuel/fuel";
import { create } from "zustand";
import { toast } from "sonner";
import {
  b2bToRow, clientToRow, db, loadAll, loadIssuanceStock, requestToRow, run, userPatch, userToRow,
} from "@/lib/cloudSync";

import { logActivity } from "@/lib/activityLog";
import { syncVehiclePool, importVoucherInventory, reconcilePazFeedback, type VehicleSyncResult } from "@/lib/backend";
import { fuelStockError, issuanceAmountError, STOCK_SHORTAGE } from "@/lib/issuanceInventory";
import { transferInventory, issueVoucherToWorker } from "@/lib/transferInventory";
import { pickExact } from "@/lib/inventorySelection";
export { pickExact } from "@/lib/inventorySelection";
import { centralPoolOf, centralFuelLimitError } from "@/lib/centralInventory";
import { notifyCentralInventoryChanged } from "@/lib/centralInventorySummary";
export { centralPoolOf } from "@/lib/centralInventory";

import {
  MAIN_POOL,
  isAvailable,
  type VoucherRecord,
} from "@/components/dashboard/voucherData";

export type Role = "admin" | "branch" | "supervisor";

export const roleLabels: Record<Role, string> = {
  admin: "אדמין",
  branch: "מנהל סניף",
  supervisor: "מפקח",
};

export interface UserRecord {
  /** ת.ז */
  id: string;
  /** משפחה */
  lastName: string;
  /** פרטי */
  firstName: string;
  /** הרשאה */
  role: Role;
  /** תפקיד */
  title: string;
  /** נייד */
  phone: string;
  /** סניף */
  branch: string;
  /** רשאי להקים דרישה */
  canRequest?: boolean;
  /** Must choose a new password on next login (initial password = ת.ז). */
  requiresPasswordChange?: boolean;
}

/** "משפחה פרטי" for selects and voucher assignment labels. */
export const fullName = (u: Pick<UserRecord, "lastName" | "firstName">) =>
  `${u.lastName} ${u.firstName}`.trim();

export interface BranchRecord {
  id: string;
  name: string;
  manager: string;
  city: string;
}

export interface ClientRecord {
  clientId: string;
  clientName: string;
  siteId: string;
  siteName: string;
  /** תקן — vehicle / manpower standard code of the site */
  standard?: string;
  /** false once missing from the latest Excel import (kept for history). */
  isActive?: boolean;
}

/** מאגר B2B — client billed per voucher. */
export interface B2BClientRecord {
  branch: string;
  accountName: string;
  clientCode: string;
  clientName: string;
  standard: string;
  balance?: string;
  loadType?: string;
  budgetSection?: string;
  accountKey?: string;
  itemFamily?: string;
  accountStatus?: string;
  accountType?: string;
  isActive?: boolean;
}

export type ReasonCategory = "B2B" | "Regular";
export const reasonCategoryLabels: Record<ReasonCategory, string> = {
  B2B: "רכב עבודה",
  Regular: "רכב פרטי",
};
export interface ReasonRecord {
  id?: string;
  name: string;
  category: ReasonCategory;
}

/** One-time worker link holding several 50/100 ₪ codes. */
export interface WorkerLink {
  id: string;
  total: number;
  serials: string[];
  createdAt: string;
  workerId?: string;
  phone?: string;
  signedAt?: string;
  employeeName?: string;
  branch?: string;
  supervisorId?: string;
  /** Locked after 3 wrong ID/phone attempts. */
  locked?: boolean;
}


/** Central-pool vouchers still available for allocation. */

/** Returns an error when the central pool can't cover the requested split exactly; null when it can. */
export function poolShortage(split: Record<"בנזין" | "סולר", number>, vouchers: VoucherRecord[]): string | null {
  const limitError = centralFuelLimitError(split, vouchers);
  if (limitError) return limitError;
  for (const f of ["בנזין", "סולר"] as const) {
    if (!split[f]) continue;
    const pool = centralPoolOf(vouchers, f);
    const amountError = issuanceAmountError(f, split[f]);
    if (amountError) return amountError;
    if (!pool.length) return STOCK_SHORTAGE;
    if (!pickExact(pool, split[f]))
      return `${STOCK_SHORTAGE}. המלאי הזמין: ${groupStock(pool)}.`;
  }
  return null;
}


/** "100 ₪ (15 שוברים), 50 ₪ (2 שוברים)" — stock grouped by face value. */
export function groupStock(list: { amount: number }[]) {
  if (!list.length) return "אין שוברים זמינים";
  const m = new Map<number, number>();
  for (const v of list) m.set(v.amount, (m.get(v.amount) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([amt, n]) => `${amt.toLocaleString("he-IL")} ₪ (${n} ${n === 1 ? "שובר" : "שוברים"})`)
    .join(", ");
}

const today = () => new Date().toISOString().slice(0, 10);

/** Details of a worker voucher issued from the supervisor screen. */
export interface WorkerIssueItem {
  amount: number;
  fuelType: FuelType;
  reason: string;
  route: "b2b" | "regular";
  clientName: string;
  clientCode: string;
  accountName?: string;
  standard?: string;
  siteId?: string;
  siteName?: string;
}

export interface WorkerIssuePayload {
  employeeName: string;
  branch: string;
  supervisor?: string;
  requester?: string;
  items: WorkerIssueItem[];
}

export interface VoucherRequest {
  id: string;
  requester: string;
  requesterId: string;
  branch: string;
  amount: number;
  reason: string;
  createdAt: string;
  status: "ממתין לאישור" | "אושר" | "נדחה";
  approvedAmount?: number;
  approver?: string;
  /** Requested split by fuel type (sums to amount). */
  benzineAmount?: number;
  dieselAmount?: number;
}

/** Metadata attached to created vouchers for audit tracking. */
export interface AllocationMeta {
  requester?: string;
  approver?: string;
  fuelType?: FuelType;
}

/** תקן for a given client + site, or "—" when unknown. */
export function siteStandard(clients: ClientRecord[], clientId?: string, siteId?: string) {
  if (!clientId || !siteId) return "—";
  return clients.find((c) => c.clientId === clientId && c.siteId === siteId)?.standard || "—";
}

interface AppState {
  loaded: boolean;
  /** Signed-in login account id and ת.ז */
  authId: string | null;
  myNationalId: string | null;
  setIdentity: (authId: string | null, nationalId: string | null) => void;
  /** Loads every table from the cloud database. */
  loadFromCloud: () => Promise<void>;
  role: Role;
  setRole: (role: Role) => void;

  balance: number;
  vouchers: VoucherRecord[];
  allocate: (
    branch: string,
    supervisor: string | undefined,
    amount: number,
    meta?: AllocationMeta,
  ) => Promise<string | null>;

  requests: VoucherRequest[];
  addRequest: (req: Omit<VoucherRequest, "id" | "createdAt" | "status">) => void;
  /** Approves a request (full or custom amount) and allocates to the requester branch. */
  approveRequest: (id: string, amount: number, approver: string) => Promise<void>;
  rejectRequest: (id: string, approver: string) => void;
  assignToSupervisor: (branch: string, supervisor: string, amount: number, fuelType?: FuelType) => Promise<string | null>;
  /** Marks vouchers redeemed by serial numbers from the Paz feedback file. */
  markSerialsRedeemed: (serials: string[]) => Promise<number>;
  importVouchers: (rows: VoucherRecord[]) => Promise<{ added: number; skipped: number; serials: string[] }>;


  users: UserRecord[];
  addUser: (user: UserRecord) => void;
  updateUser: (id: string, patch: Partial<UserRecord>) => void;
  removeUser: (id: string) => void;
  /** Adds only rows whose ת.ז is new. Returns added/skipped counts. */
  importUsers: (rows: UserRecord[]) => { added: number; skipped: number };
  setUserCanRequest: (id: string, value: boolean) => void;

  branchList: BranchRecord[];
  addBranch: (branch: BranchRecord) => void;
  updateBranch: (id: string, patch: Partial<Omit<BranchRecord, "id">>) => void;
  removeBranch: (id: string) => void;

  nonB2bClients: ClientRecord[];
  addClient: (client: ClientRecord) => void;
  updateClient: (clientId: string, siteId: string, patch: Partial<ClientRecord>) => void;
  /** Upsert by clientId + siteId. Returns added/updated counts. */
  importClients: (rows: ClientRecord[]) => Promise<VehicleSyncResult>;
  removeClient: (clientId: string, siteId: string) => void;

  b2bClients: B2BClientRecord[];
  addB2b: (row: B2BClientRecord) => void;
  updateB2b: (clientCode: string, accountName: string, patch: Partial<B2BClientRecord>) => void;
  /** Upsert by clientCode + accountName. */
  importB2b: (rows: B2BClientRecord[]) => Promise<VehicleSyncResult>;
  removeB2b: (clientCode: string, accountName: string) => void;

  links: WorkerLink[];
  /** Saves ID + phone after the worker signs. */
  signLink: (id: string, workerId: string, phone: string) => void;

  /** Issues a voucher handed to an end worker, storing the resolved vehicle/client data. */
  issueWorkerVoucher: (payload: WorkerIssuePayload) => Promise<WorkerLink | { error: string }>;

  reasons: ReasonRecord[];
  addReason: (reason: ReasonRecord) => void;
  updateReason: (index: number, reason: ReasonRecord) => void;
  removeReason: (index: number) => void;
}

export const ROLE_KEY = "reshef.role";

/** Reads the simulated role saved in the browser, if any. */
export function storedRole(): Role | null {
  return null;
}

import { cardsOfFuel, issuancePool } from "@/lib/issuanceStock";
export const useAppStore = create<AppState>()(
  (set, get) => ({
  loaded: false,
  authId: null,
  myNationalId: null,
  setIdentity: (authId, myNationalId) => set({ authId, myNationalId }),
  loadFromCloud: async () => {
    try {
      // Clean up the old browser-only copy; the cloud is the only source now.
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("reshef.store.v2");
        window.localStorage.removeItem(ROLE_KEY);
      }
      const data = await loadAll();
      // Vouchers never expire; only the employee link does (checked server-side).
      set({ ...data, loaded: true });
    } catch (e) {
      set({ loaded: true });
      toast.error(`טעינת הנתונים מהענן נכשלה: ${(e as Error).message}`);
    }
  },
  role: "admin",
  setRole: (role) => set({ role }),

  balance: 0,
  vouchers: [],
  allocate: async (branch, supervisor, amount, meta) => {
    // Moves real vouchers out of the central pool; never creates nominal stock.
    const fuel = meta?.fuelType ?? "בנזין";
    const amountError = issuanceAmountError(fuel, amount);
    if (amountError) return amountError;
    try { set({ vouchers: await loadIssuanceStock() }); }
    catch { return "בדיקת המלאי נכשלה — ההקצאה לא בוצעה"; }
    const limitError = centralFuelLimitError({ "בנזין": fuel === "בנזין" ? amount : 0, "סולר": fuel === "סולר" ? amount : 0 }, get().vouchers);
    if (limitError) return limitError;
    const pool = centralPoolOf(get().vouchers, fuel);
    if (!pool.length) return STOCK_SHORTAGE;
    const pick = pickExact(pool, amount);
    if (!pick) return `${STOCK_SHORTAGE}. המלאי הזמין: ${groupStock(pool)}.`;
    const ids = new Set(pick.map((v) => v.serial));
    const changed: VoucherRecord[] = [];
    const vouchers = get().vouchers.map((v) => {
      if (!ids.has(v.serial)) return v;
      const nv: VoucherRecord = {
        ...v,
        branch,
        ...(supervisor ? { supervisor } : {}),
        updatedAt: today(),
        ...(meta?.requester ? { requester: meta.requester } : {}),
        ...(meta?.approver ? { approver: meta.approver } : {}),
      };
      changed.push(nv);
      return nv;
    });
    const balance = Math.max(0, get().balance - amount);
    try {
      await transferInventory([{ amount, fuel_type: fuel, serials: pick.map(v => v.serial), details: { requester: meta?.requester, approver: meta?.approver } }], branch, supervisor);
    } catch (error) { return error instanceof Error ? error.message : "שמירת ההקצאה נכשלה"; }
    set((state) => ({ balance, vouchers: state.vouchers.map(v => changed.find(c => c.serial === v.serial) ?? v) }));
    notifyCentralInventoryChanged();
    run(db.from("app_settings").update({ balance }).eq("key", "main"));
    logActivity(actorOf(get()), "הקצאת שוברים", `${branch}${supervisor ? ` (${supervisor})` : ""} · ${fuel} · ${amount} ₪`);
    return null;
  },
  assignToSupervisor: async (branch, supervisor, amount, fuelType = "בנזין") => {
    const amountError = issuanceAmountError(fuelType, amount);
    if (amountError) return amountError;
    try { set({ vouchers: await loadIssuanceStock() }); }
    catch { return "בדיקת המלאי נכשלה — ההקצאה לא בוצעה"; }
    const candidates = get().vouchers.filter(
      (v) => v.branch === branch && !v.supervisor && v.status === "טרם שומש" && (!fuelType || fuelOf(v) === fuelType),
    );
    const selection = pickExact(candidates, amount);
    if (!selection) return STOCK_SHORTAGE;
    const picked = new Set(selection.map((v) => v.serial));
    const changed: VoucherRecord[] = [];
    const vouchers = get().vouchers.map((v) => {
      if (!picked.has(v.serial)) return v;
      const nv = { ...v, supervisor, updatedAt: today() };
      changed.push(nv);
      return nv;
    });
    try { await transferInventory([{ amount, fuel_type: fuelType, serials: [...picked] }], branch, supervisor); }
    catch (error) { return error instanceof Error ? error.message : "שמירת ההקצאה נכשלה"; }
    set({ vouchers });
    notifyCentralInventoryChanged();
    logActivity(actorOf(get()), "הקצאה למפקח", `${supervisor} · ${fuelType} · ${amount} ₪`);
    return null;
  },
  markSerialsRedeemed: async (serials) => {
    const updated = await reconcilePazFeedback([...new Set(serials.map(s => s.trim()).filter(Boolean))]);
    set({ vouchers: await loadIssuanceStock() });
    notifyCentralInventoryChanged();
    return updated;
  },
  importVouchers: async (rows) => {
    const result = await importVoucherInventory(rows.map(v => ({ serial: v.serial, real_code: v.realCode, amount: v.amount, fuel_type: v.fuelType ?? "בנזין" })));
    set({ vouchers: await loadIssuanceStock() });
    notifyCentralInventoryChanged();
    return result;
  },

  requests: [],
  addRequest: (req) => {
    const row: VoucherRequest = {
      ...req,
      id: `req-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      createdAt: today(),
      status: "ממתין לאישור",
    };
    set((s) => ({ requests: [row, ...s.requests] }));
    run(db.from("voucher_requests").insert(requestToRow(row)));
    logActivity(actorOf(get()), "הגשת דרישת שוברים", `${row.branch} · ${row.amount} ₪`);
  },
  approveRequest: async (id, amount, approver) => {
    const req = get().requests.find((r) => r.id === id);
    if (!req) return;
    const asked = (req.benzineAmount ?? 0) + (req.dieselAmount ?? 0);
    if (asked > 0) {
      // Keep the requested fuel split; scale down proportionally if approving less.
      let diesel = Math.round(((req.dieselAmount ?? 0) * Math.min(amount, asked)) / asked / 50) * 50;
      if (amount > asked) diesel = req.dieselAmount ?? 0;
      const benzine = Math.max(0, amount - diesel);
      const fail = poolShortage({ "בנזין": benzine, "סולר": diesel }, get().vouchers);
      if (fail) return void toast.error(fail);
      for (const [fuelType, fuelAmount] of [["בנזין", benzine], ["סולר", diesel]] as const) {
        if (!fuelAmount) continue;
        const error = await get().allocate(req.branch, undefined, fuelAmount, { requester: req.requester, approver, fuelType });
        if (error) return void toast.error(error);
      }
    } else {
      const err = await get().allocate(req.branch, undefined, amount, { requester: req.requester, approver });
      if (err) return void toast.error(err);
    }
    set((s) => ({
      requests: s.requests.map((r) =>
        r.id === id ? { ...r, status: "אושר" as const, approvedAmount: amount, approver } : r,
      ),
    }));
    run(db.from("voucher_requests").update({ status: "אושר", approved_amount: amount, approver }).eq("id", id));
    logActivity(actorOf(get()), "אישור דרישה", `${req.requester} · ${amount} ₪`);
  },
  rejectRequest: (id, approver) => {
    set((s) => ({
      requests: s.requests.map((r) => (r.id === id ? { ...r, status: "נדחה" as const, approver } : r)),
    }));
    run(db.from("voucher_requests").update({ status: "נדחה", approver }).eq("id", id));
    logActivity(actorOf(get()), "דחיית דרישה", get().requests.find((r) => r.id === id)?.requester);
  },

  users: [],
  addUser: (user) => {
    set((s) => ({ users: [user, ...s.users.filter((u) => u.id !== user.id)] }));
    run(db.from("app_users").upsert(userToRow(user)));
    logActivity(actorOf(get()), "הוספת משתמש", fullName(user));
  },
  updateUser: (id, patch) => {
    set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
    run(db.from("app_users").update(userPatch(patch)).eq("national_id", id));
    logActivity(actorOf(get()), "עדכון משתמש", id);
  },
  removeUser: (id) => {
    set((s) => ({ users: s.users.filter((u) => u.id !== id) }));
    run(db.from("app_users").delete().eq("national_id", id));
    logActivity(actorOf(get()), "מחיקת משתמש", id);
  },
  importUsers: (rows) => {
    const existing = new Set(get().users.map((u) => u.id));
    const fresh: UserRecord[] = [];
    let skipped = 0;
    for (const row of rows) {
      if (existing.has(row.id)) {
        skipped += 1;
        continue;
      }
      existing.add(row.id);
      fresh.push(row);
    }
    if (fresh.length) {
      set((s) => ({ users: [...fresh, ...s.users] }));
      run(db.from("app_users").insert(fresh.map(userToRow)));
    }
    return { added: fresh.length, skipped };
  },
  setUserCanRequest: (id, value) => get().updateUser(id, { canRequest: value }),

  branchList: [],
  addBranch: (branch) => {
    set((s) => ({ branchList: [...s.branchList, branch] }));
    run(db.from("branches").insert(branch));
  },
  updateBranch: (id, patch) => {
    set((s) => ({ branchList: s.branchList.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
    run(db.from("branches").update(patch).eq("id", id));
  },
  removeBranch: (id) => {
    set((s) => ({ branchList: s.branchList.filter((b) => b.id !== id) }));
    run(db.from("branches").delete().eq("id", id));
  },

  nonB2bClients: [],
  addClient: (client) => {
    set((s) => ({ nonB2bClients: [client, ...s.nonB2bClients] }));
    run(db.from("regular_clients").upsert(clientToRow(client), { onConflict: "client_id,site_id" }));
  },
  updateClient: (clientId, siteId, patch) => {
    let next: ClientRecord | undefined;
    set((s) => ({
      nonB2bClients: s.nonB2bClients.map((c) => {
        if (c.clientId !== clientId || c.siteId !== siteId) return c;
        next = { ...c, ...patch };
        return next;
      }),
    }));
    if (next)
      run(db.from("regular_clients").update(clientToRow(next)).eq("client_id", clientId).eq("site_id", siteId));
  },
  importClients: async (rows) => {
    const result = await syncVehiclePool("regular", rows.map(clientToRow));
    const fresh = await loadAll();
    set({ nonB2bClients: fresh.nonB2bClients });
    return result;
  },
  removeClient: (clientId, siteId) => {
    set((s) => ({
      nonB2bClients: s.nonB2bClients.filter((c) => !(c.clientId === clientId && c.siteId === siteId)),
    }));
    run(db.from("regular_clients").delete().eq("client_id", clientId).eq("site_id", siteId));
  },

  b2bClients: [],
  addB2b: (row) => {
    set((s) => ({ b2bClients: [row, ...s.b2bClients] }));
    run(db.from("b2b_clients").upsert(b2bToRow(row), { onConflict: "client_code,account_name" }));
  },
  updateB2b: (code, account, patch) => {
    let next: B2BClientRecord | undefined;
    set((s) => ({
      b2bClients: s.b2bClients.map((c) => {
        if (c.clientCode !== code || c.accountName !== account) return c;
        next = { ...c, ...patch };
        return next;
      }),
    }));
    if (next)
      run(db.from("b2b_clients").update(b2bToRow(next)).eq("client_code", code).eq("account_name", account));
  },
  importB2b: async (rows) => {
    const result = await syncVehiclePool("b2b", rows.map(b2bToRow));
    const fresh = await loadAll();
    set({ b2bClients: fresh.b2bClients });
    return result;
  },
  removeB2b: (code, account) => {
    set((s) => ({
      b2bClients: s.b2bClients.filter((c) => !(c.clientCode === code && c.accountName === account)),
    }));
    run(db.from("b2b_clients").delete().eq("client_code", code).eq("account_name", account));
  },

  links: [],
  signLink: (id, workerId, phone) =>
    set((s) => {
      const link = s.links.find((l) => l.id === id);
      const serials = new Set(link?.serials ?? []);
      return {
        links: s.links.map((l) => (l.id === id ? { ...l, workerId, phone, signedAt: today() } : l)),
        vouchers: s.vouchers.map((v) => (serials.has(v.serial) ? { ...v, workerId } : v)),
      };
    }),

  issueWorkerVoucher: async (p) => {
    for (const item of p.items) {
      const error = issuanceAmountError(item.fuelType, item.amount);
      if (error) return { error };
    }
    let stock: VoucherRecord[];
    try { stock = await loadIssuanceStock(); }
    catch { return { error: "בדיקת המלאי נכשלה — לא הופק לינק. יש לנסות שוב" }; }
    set({ vouchers: stock });
    const st = get();
    const linkId = String(Math.floor(10000000 + Math.random() * 89999999));
    const pool = issuancePool(stock, { role: st.role, branch: p.branch, supervisorName: p.supervisor });
    const byFuel = new Map<FuelType, VoucherRecord[]>(FUEL_TYPES.map(f => [f, cardsOfFuel(pool, f)]));
    for (const fuel of FUEL_TYPES) {
      const need = p.items.filter(it => it.fuelType === fuel).reduce((sum, it) => sum + it.amount, 0);
      const have = byFuel.get(fuel) ?? [];
      const error = fuelStockError(fuel, need, have);
      if (error) return { error: fuel === "סולר" ? error : `${error}. המלאי הזמין כעת בסוג דלק זה: ${groupStock(have)}.` };
    }
    const chosen: VoucherRecord[][] = [];
    for (const item of p.items) {
      const list = byFuel.get(item.fuelType) ?? [];
      const picked = pickExact(list, item.amount);
      if (!picked) return { error: `${STOCK_SHORTAGE}. המלאי הזמין כעת בסוג דלק זה: ${groupStock(list)}.` };
      const serials = new Set(picked.map(v => v.serial));
      byFuel.set(item.fuelType, list.filter(v => !serials.has(v.serial)));
      chosen.push(picked);
    }
    const issuedAt = new Date().toISOString();
    const exp = new Date();
    exp.setMonth(exp.getMonth() + 3);
    const expiresAt = exp.toISOString();
    const out: VoucherRecord[] = [];
    for (const [idx, it] of p.items.entries()) {
      for (const seed of chosen[idx] ?? []) {
        out.push({
          ...seed,
          branch: p.branch,
          ...(p.supervisor ? { supervisor: p.supervisor } : {}),
          ...(st.authId ? { supervisorId: st.authId } : {}),
          status: "הוקצה לעובד",
          updatedAt: today(),
          deliveredAt: today(),
          issuedAt,
          expiresAt,
          workerName: p.employeeName,
          route: it.route,
          linkId,
          client: it.clientName,
          clientId: it.clientCode,
          clientCode: it.clientCode,
          ...(it.accountName ? { accountName: it.accountName } : {}),
          ...(it.standard ? { standard: it.standard } : {}),
          ...(it.siteId ? { siteId: it.siteId } : {}),
          ...(it.siteName ? { siteName: it.siteName } : {}),
          reason: it.reason,
          ...(p.requester ? { requester: p.requester } : {}),
        });
      }
    }
    const link: WorkerLink = {
      id: linkId,
      total: out.reduce((t, v) => t + v.amount, 0),
      serials: out.map((v) => v.serial),
      createdAt: today(),
      employeeName: p.employeeName,
      branch: p.branch,
      ...(st.authId ? { supervisorId: st.authId } : {}),
    };
    const bySerial = new Map(out.map((v) => [v.serial, v]));
    try {
      const issued = await issueVoucherToWorker(p.items.map((item) => ({
        amount: item.amount, fuel_type: item.fuelType,
        details: { client: item.clientName, client_id: item.clientCode, client_code: item.clientCode,
          account_name: item.accountName, standard: item.standard, site_id: item.siteId,
          site_name: item.siteName, route: item.route, reason: item.reason, requester: p.requester },
      })), p.branch, p.supervisor, { id: linkId, employee_name: p.employeeName });
      // The database chose the physical cards; reflect its choice locally.
      const chosenSerials = new Set(issued.map(c => c.serial));
      const seeds = out.slice();
      out.length = 0;
      for (const card of issued) {
        const tmpl = seeds.find(v => v.fuelType === card.fuelType) ?? seeds[0];
        const base = stock.find(v => v.serial === card.serial);
        if (tmpl && base) out.push({ ...tmpl, ...{ serial: base.serial, amount: base.amount, fuelType: base.fuelType, realCode: base.realCode } });
      }
      link.serials = [...chosenSerials];
      link.total = issued.reduce((t, c) => t + c.amount, 0);
    } catch (err) {
      // Reload stock if only the voucher write succeeded. Never expose an unsaved link.
      await get().loadFromCloud().catch(() => undefined);
      return { error: `שמירת הלינק נכשלה: ${err instanceof Error ? err.message : "יש לנסות שוב"}` };
    }
    set((s) => {
      const existing = new Set(s.vouchers.map((v) => v.serial));
      return {
        vouchers: [
          ...out.filter((v) => !existing.has(v.serial)),
          ...s.vouchers.map((v) => bySerial.get(v.serial) ?? v),
        ],
        links: [link, ...s.links],
      };
    });
    logActivity(actorOf(get()), "הנפקת שובר לעובד", `קישור ${link.id} · ${link.total} ₪`);
    notifyCentralInventoryChanged();
    return link;
  },

  reasons: [],
  addReason: (reason) => {
    const row = { ...reason, id: reason.id ?? crypto.randomUUID() };
    set((s) => ({ reasons: [...s.reasons, row] }));
    run(db.from("issue_reasons").insert({ id: row.id, name: row.name, category: row.category }));
  },
  updateReason: (index, reason) => {
    const prev = get().reasons[index];
    const row = { ...reason, id: prev?.id ?? reason.id };
    set((s) => ({ reasons: s.reasons.map((r, i) => (i === index ? row : r)) }));
    if (row.id) run(db.from("issue_reasons").update({ name: row.name, category: row.category }).eq("id", row.id));
  },
  removeReason: (index) => {
    const prev = get().reasons[index];
    set((s) => ({ reasons: s.reasons.filter((_, i) => i !== index) }));
    if (prev?.id) run(db.from("issue_reasons").delete().eq("id", prev.id));
  },
}),
);


/** The user represented by the role simulator; prefers one allowed to request. */
export function pickCurrentUser(users: UserRecord[], role: Role) {
  if (role === "branch") {
    // Preview: prefer a branch manager whose branch actually has supervisors.
    const staffed = new Set(users.filter((u) => u.role === "supervisor").map((u) => u.branch.trim()));
    const m = users.find((u) => u.role === "branch" && staffed.has(u.branch.trim()));
    if (m) return m;
  }
  return users.find((u) => u.role === role && u.canRequest) ?? users.find((u) => u.role === role);
}

export function useCurrentUser() {
  const users = useAppStore((s) => s.users);
  const nid = useAppStore((s) => s.myNationalId);
  const mine = nid ? users.find((u) => u.id === nid) : undefined;
  return mine;
}

export { MAIN_POOL };

/** The person performing an action (signed-in user, else the role preview pick). */
/** Who is acting right now, for the activity log. */
export const currentActor = () => actorOf(useAppStore.getState());

function actorOf(st: AppState) {
  const mine = st.myNationalId ? st.users.find((u) => u.id === st.myNationalId) : undefined;
  const u = mine;
  return { name: u ? fullName(u) : "", role: st.role };
}
