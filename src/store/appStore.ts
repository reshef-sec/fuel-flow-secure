import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  MAIN_POOL,
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
}

export type ReasonCategory = "B2B" | "Regular";
export const reasonCategoryLabels: Record<ReasonCategory, string> = {
  B2B: "חיוב לקוח",
  Regular: "ללא חיוב",
};
export interface ReasonRecord {
  name: string;
  category: ReasonCategory;
}

/** One-time worker link holding several 100 ₪ codes. */
export interface WorkerLink {
  id: string;
  total: number;
  serials: string[];
  createdAt: string;
  workerId?: string;
  phone?: string;
  signedAt?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Details of a worker voucher issued from the supervisor screen. */
export interface WorkerIssuePayload {
  amount: number;
  reason: string;
  branch: string;
  supervisor?: string;
  route: "b2b" | "regular";
  clientName: string;
  clientCode: string;
  accountName?: string;
  standard?: string;
  siteId?: string;
  siteName?: string;
  requester?: string;
  approver?: string;
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
}

/** Metadata attached to created vouchers for audit tracking. */
export interface AllocationMeta {
  requester?: string;
  approver?: string;
}

/** תקן for a given client + site, or "—" when unknown. */
export function siteStandard(clients: ClientRecord[], clientId?: string, siteId?: string) {
  if (!clientId || !siteId) return "—";
  return clients.find((c) => c.clientId === clientId && c.siteId === siteId)?.standard || "—";
}

interface AppState {
  role: Role;
  setRole: (role: Role) => void;

  balance: number;
  vouchers: VoucherRecord[];
  allocate: (
    branch: string,
    supervisor: string | undefined,
    amount: number,
    meta?: AllocationMeta,
  ) => void;

  requests: VoucherRequest[];
  addRequest: (req: Omit<VoucherRequest, "id" | "createdAt" | "status">) => void;
  /** Approves a request (full or custom amount) and allocates to the requester branch. */
  approveRequest: (id: string, amount: number, approver: string) => void;
  rejectRequest: (id: string, approver: string) => void;
  assignToSupervisor: (branch: string, supervisor: string, amount: number) => void;
  markPazRedeemed: (count: number) => number;
  /** Marks vouchers redeemed by serial numbers from the Paz feedback file. */
  markSerialsRedeemed: (serials: string[]) => number;
  importVouchers: (rows: VoucherRecord[]) => void;


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
  importClients: (rows: ClientRecord[]) => { added: number; updated: number };
  removeClient: (clientId: string, siteId: string) => void;

  b2bClients: B2BClientRecord[];
  addB2b: (row: B2BClientRecord) => void;
  updateB2b: (clientCode: string, accountName: string, patch: Partial<B2BClientRecord>) => void;
  /** Upsert by clientCode + accountName. */
  importB2b: (rows: B2BClientRecord[]) => { added: number; updated: number };
  removeB2b: (clientCode: string, accountName: string) => void;

  links: WorkerLink[];
  /** Saves ID + phone after the worker signs. */
  signLink: (id: string, workerId: string, phone: string) => void;

  /** Issues a voucher handed to an end worker, storing the resolved vehicle/client data. */
  issueWorkerVoucher: (payload: WorkerIssuePayload) => WorkerLink;

  reasons: ReasonRecord[];
  addReason: (reason: ReasonRecord) => void;
  updateReason: (index: number, reason: ReasonRecord) => void;
  removeReason: (index: number) => void;
}

export const ROLE_KEY = "reshef.role";

/** Reads the simulated role saved in the browser, if any. */
export function storedRole(): Role | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(ROLE_KEY);
  return saved === "admin" || saved === "branch" || saved === "supervisor" ? saved : null;
}

export const useAppStore = create<AppState>()(
  persist(
  (set, get) => ({
  role: "admin",
  setRole: (role) => {
    if (typeof window !== "undefined") window.localStorage.setItem(ROLE_KEY, role);
    set({ role });
  },

  balance: 0,
  vouchers: [],
  allocate: (branch, supervisor, amount, meta) =>
    set((s) => {
      const count = Math.floor(amount / 100);
      const created: VoucherRecord[] = Array.from({ length: count }, (_, i) => ({
        serial: String(Math.floor(100000 + Math.random() * 899999) + i),
        realCode: `RB-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`,
        amount: 100,
        branch,
        ...(supervisor ? { supervisor } : {}),
        status: supervisor ? ("הוקצה לעובד" as const) : ("טרם שומש" as const),
        updatedAt: today(),
        ...(meta?.requester ? { requester: meta.requester } : {}),
        ...(meta?.approver ? { approver: meta.approver } : {}),
      }));
      return {
        balance: Math.max(0, s.balance - amount),
        vouchers: [...created, ...s.vouchers],
      };
    }),
  assignToSupervisor: (branch, supervisor, amount) =>
    set((s) => {
      let left = amount;
      const vouchers = s.vouchers.map((v) => {
        if (left <= 0) return v;
        if (v.branch !== branch || v.supervisor || v.status !== "טרם שומש") return v;
        if (v.amount > left) return v;
        left -= v.amount;
        return { ...v, supervisor, status: "הוקצה לעובד" as const, updatedAt: today() };
      });
      return { vouchers };
    }),
  markPazRedeemed: (count) => {
    let updated = 0;
    set((s) => {
      let left = count;
      const vouchers = s.vouchers.map((v) => {
        if (left <= 0 || v.status !== "הוקצה לעובד") return v;
        left -= 1;
        updated += 1;
        return { ...v, status: "מומש סופית" as const, updatedAt: today() };
      });
      return { vouchers };
    });
    return updated;
  },
  markSerialsRedeemed: (serials) => {
    const wanted = new Set(serials.map((s) => s.trim()).filter(Boolean));
    let updated = 0;
    set((s) => ({
      vouchers: s.vouchers.map((v) => {
        if (!wanted.has(v.serial) || v.status === "מומש סופית") return v;
        updated += 1;
        return { ...v, status: "מומש סופית" as const, updatedAt: today() };
      }),
    }));
    return updated;
  },
  importVouchers: (rows) => set((s) => ({ vouchers: [...rows, ...s.vouchers] })),

  requests: [],
  addRequest: (req) =>
    set((s) => ({
      requests: [
        {
          ...req,
          id: `req-${Date.now()}-${Math.floor(Math.random() * 999)}`,
          createdAt: today(),
          status: "ממתין לאישור" as const,
        },
        ...s.requests,
      ],
    })),
  approveRequest: (id, amount, approver) => {
    const req = get().requests.find((r) => r.id === id);
    if (!req) return;
    get().allocate(req.branch, undefined, amount, { requester: req.requester, approver });
    set((s) => ({
      requests: s.requests.map((r) =>
        r.id === id ? { ...r, status: "אושר" as const, approvedAmount: amount, approver } : r,
      ),
    }));
  },
  rejectRequest: (id, approver) =>
    set((s) => ({
      requests: s.requests.map((r) =>
        r.id === id ? { ...r, status: "נדחה" as const, approver } : r,
      ),
    })),


  users: [],
  addUser: (user) => set((s) => ({ users: [user, ...s.users] })),
  updateUser: (id, patch) =>
    set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),
  removeUser: (id) => set((s) => ({ users: s.users.filter((u) => u.id !== id) })),
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
    if (fresh.length) set((s) => ({ users: [...fresh, ...s.users] }));
    return { added: fresh.length, skipped };
  },
  setUserCanRequest: (id, value) =>
    set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, canRequest: value } : u)) })),

  branchList: [],
  addBranch: (branch) => set((s) => ({ branchList: [...s.branchList, branch] })),
  updateBranch: (id, patch) =>
    set((s) => ({
      branchList: s.branchList.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),
  removeBranch: (id) => set((s) => ({ branchList: s.branchList.filter((b) => b.id !== id) })),

  nonB2bClients: [],
  addClient: (client) => set((s) => ({ nonB2bClients: [client, ...s.nonB2bClients] })),
  updateClient: (clientId, siteId, patch) =>
    set((s) => ({
      nonB2bClients: s.nonB2bClients.map((c) =>
        c.clientId === clientId && c.siteId === siteId ? { ...c, ...patch } : c,
      ),
    })),
  /** Upserts imported rows by clientId + siteId (no duplicates). */
  importClients: (rows) => {
    const existing = new Map(get().nonB2bClients.map((c) => [`${c.clientId}|${c.siteId}`, c]));
    let updated = 0;
    let added = 0;
    for (const row of rows) {
      const key = `${row.clientId}|${row.siteId}`;
      if (existing.has(key)) {
        existing.set(key, { ...existing.get(key)!, ...row });
        updated += 1;
      } else {
        existing.set(key, row);
        added += 1;
      }
    }
    set({ nonB2bClients: [...existing.values()] });
    return { added, updated };
  },
  removeClient: (clientId, siteId) =>
    set((s) => ({
      nonB2bClients: s.nonB2bClients.filter((c) => !(c.clientId === clientId && c.siteId === siteId)),
    })),

  b2bClients: [],
  addB2b: (row) => set((s) => ({ b2bClients: [row, ...s.b2bClients] })),
  updateB2b: (code, account, patch) =>
    set((s) => ({
      b2bClients: s.b2bClients.map((c) =>
        c.clientCode === code && c.accountName === account ? { ...c, ...patch } : c,
      ),
    })),
  importB2b: (rows) => {
    const existing = new Map(get().b2bClients.map((c) => [`${c.clientCode}|${c.accountName}`, c]));
    let added = 0;
    let updated = 0;
    for (const row of rows) {
      const key = `${row.clientCode}|${row.accountName}`;
      if (existing.has(key)) {
        existing.set(key, { ...existing.get(key)!, ...row });
        updated += 1;
      } else {
        existing.set(key, row);
        added += 1;
      }
    }
    set({ b2bClients: [...existing.values()] });
    return { added, updated };
  },
  removeB2b: (code, account) =>
    set((s) => ({
      b2bClients: s.b2bClients.filter((c) => !(c.clientCode === code && c.accountName === account)),
    })),

  links: [],
  signLink: (id, workerId, phone) =>
    set((s) => {
      const link = s.links.find((l) => l.id === id);
      const serials = new Set(link?.serials ?? []);
      return {
        links: s.links.map((l) =>
          l.id === id ? { ...l, workerId, phone, signedAt: today() } : l,
        ),
        vouchers: s.vouchers.map((v) => (serials.has(v.serial) ? { ...v, workerId } : v)),
      };
    }),

  issueWorkerVoucher: (p) => {
    const linkId = String(Math.floor(10000000 + Math.random() * 89999999));
    const count = Math.max(1, Math.floor(p.amount / 100));
    const base = Math.floor(700000 + Math.random() * 290000);
    const created: VoucherRecord[] = Array.from({ length: count }, (_, i) => ({
      serial: String(base + i),
      realCode: `RB-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`,
      amount: 100,
      branch: p.branch,
      ...(p.supervisor ? { supervisor: p.supervisor } : {}),
      status: "הוקצה לעובד" as const,
      updatedAt: today(),
      deliveredAt: today(),
      route: p.route,
      linkId,
      client: p.clientName,
      clientId: p.clientCode,
      clientCode: p.clientCode,
      ...(p.accountName ? { accountName: p.accountName } : {}),
      ...(p.standard ? { standard: p.standard } : {}),
      ...(p.siteId ? { siteId: p.siteId } : {}),
      ...(p.siteName ? { siteName: p.siteName } : {}),
      reason: p.reason,
      ...(p.requester ? { requester: p.requester } : {}),
      ...(p.approver ? { approver: p.approver } : {}),
    }));
    const link: WorkerLink = {
      id: linkId,
      total: count * 100,
      serials: created.map((v) => v.serial),
      createdAt: today(),
    };
    set((s) => ({ vouchers: [...created, ...s.vouchers], links: [link, ...s.links] }));
    return link;
  },


  reasons: [],
  addReason: (reason) => set((s) => ({ reasons: [...s.reasons, reason] })),
  updateReason: (index, reason) =>
    set((s) => ({ reasons: s.reasons.map((r, i) => (i === index ? reason : r)) })),
  removeReason: (index) => set((s) => ({ reasons: s.reasons.filter((_, i) => i !== index) })),
}),
  {
    name: "reshef.store.v2",
    version: 3,
    skipHydration: true,
    merge: (persisted, current) => ({ ...current, ...(persisted as Partial<AppState>) }),
    partialize: (s) => ({
      vouchers: s.vouchers,
      links: s.links,
      b2bClients: s.b2bClients,
      reasons: s.reasons,
      balance: s.balance,
      requests: s.requests,
      users: s.users,
      branchList: s.branchList,
      nonB2bClients: s.nonB2bClients,
    }),
  },
  ),
);


/** The user represented by the role simulator; prefers one allowed to request. */
export function pickCurrentUser(users: UserRecord[], role: Role) {
  return users.find((u) => u.role === role && u.canRequest) ?? users.find((u) => u.role === role);
}

export function useCurrentUser() {
  const users = useAppStore((s) => s.users);
  const role = useAppStore((s) => s.role);
  return pickCurrentUser(users, role);
}

export { MAIN_POOL };
