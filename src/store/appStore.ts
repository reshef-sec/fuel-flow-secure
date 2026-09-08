import { create } from "zustand";

import {
  MAIN_POOL,
  vouchers as seedVouchers,
  type VoucherRecord,
} from "@/components/dashboard/voucherData";

export type Role = "admin" | "branch" | "supervisor";

export const roleLabels: Record<Role, string> = {
  admin: "אדמין מרכזי",
  branch: "מנהל סניף",
  supervisor: "מפקח",
};

export interface UserRecord {
  id: string;
  name: string;
  phone: string;
  role: Role;
  branch: string;
}

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
}

const today = () => new Date().toISOString().slice(0, 10);

const seedBranches: BranchRecord[] = [
  { id: "b1", name: "סניף מרכז", manager: "דנה כהן", city: "תל אביב" },
  { id: "b2", name: "סניף צפון", manager: "אורי לוי", city: "עפולה" },
  { id: "b3", name: "סניף דרום", manager: "דן מזרחי", city: "באר שבע" },
  { id: "b4", name: "סניף ירושלים", manager: "נועה ברק", city: "ירושלים" },
  { id: "b5", name: "סניף חיפה", manager: "רון אלמוג", city: "חיפה" },
];

/** Static list kept for forms that only need branch names. */
export const branches = seedBranches.map((b) => b.name);

interface AppState {
  role: Role;
  setRole: (role: Role) => void;

  balance: number;
  vouchers: VoucherRecord[];
  allocate: (branch: string, supervisor: string | undefined, amount: number) => void;
  importVouchers: (rows: VoucherRecord[]) => void;

  users: UserRecord[];
  addUser: (user: UserRecord) => void;
  removeUser: (id: string) => void;

  branchList: BranchRecord[];
  addBranch: (branch: BranchRecord) => void;
  updateBranch: (id: string, patch: Partial<Omit<BranchRecord, "id">>) => void;
  removeBranch: (id: string) => void;

  clients: ClientRecord[];
  addClient: (client: ClientRecord) => void;
  importClients: (rows: ClientRecord[]) => void;
  removeClient: (clientId: string, siteId: string) => void;

  reasons: string[];
  addReason: (reason: string) => void;
  updateReason: (index: number, reason: string) => void;
  removeReason: (index: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  role: "admin",
  setRole: (role) => set({ role }),

  balance: 15000,
  vouchers: seedVouchers,
  allocate: (branch, supervisor, amount) =>
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
      }));
      return {
        balance: Math.max(0, s.balance - amount),
        vouchers: [...created, ...s.vouchers],
      };
    }),
  importVouchers: (rows) => set((s) => ({ vouchers: [...rows, ...s.vouchers] })),

  users: [
    { id: "312445678", name: "דנה כהן", phone: "052-1234567", role: "admin", branch: "סניף מרכז" },
    { id: "045123987", name: "אורי לוי", phone: "054-7654321", role: "branch", branch: "סניף צפון" },
    { id: "201998432", name: "מפקח דן", phone: "050-9988776", role: "supervisor", branch: "סניף צפון" },
    { id: "318772004", name: "מפקח אורי", phone: "053-4455667", role: "supervisor", branch: "סניף מרכז" },
  ],
  addUser: (user) => set((s) => ({ users: [user, ...s.users] })),
  removeUser: (id) => set((s) => ({ users: s.users.filter((u) => u.id !== id) })),

  branchList: seedBranches,
  addBranch: (branch) => set((s) => ({ branchList: [...s.branchList, branch] })),
  updateBranch: (id, patch) =>
    set((s) => ({
      branchList: s.branchList.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),
  removeBranch: (id) => set((s) => ({ branchList: s.branchList.filter((b) => b.id !== id) })),

  clients: [
    { clientId: "1001", clientName: "מפעלי הצפון", siteId: "11", siteName: "אתר ייצור עפולה" },
    { clientId: "1001", clientName: "מפעלי הצפון", siteId: "12", siteName: "מחסן לוגיסטי" },
    { clientId: "1042", clientName: "קניון הדרום", siteId: "21", siteName: "חניון ראשי" },
    { clientId: "1108", clientName: "בנק ירושלים", siteId: "31", siteName: "סניף מרכז העיר" },
  ],
  addClient: (client) => set((s) => ({ clients: [client, ...s.clients] })),
  importClients: (rows) => set((s) => ({ clients: [...rows, ...s.clients] })),
  removeClient: (clientId, siteId) =>
    set((s) => ({
      clients: s.clients.filter((c) => !(c.clientId === clientId && c.siteId === siteId)),
    })),

  reasons: ["חידוש מלאי שוטף", "הקצאה חד פעמית", "סיור ניידות", "אירוע חריג"],
  addReason: (reason) => set((s) => ({ reasons: [...s.reasons, reason] })),
  updateReason: (index, reason) =>
    set((s) => ({ reasons: s.reasons.map((r, i) => (i === index ? reason : r)) })),
  removeReason: (index) => set((s) => ({ reasons: s.reasons.filter((_, i) => i !== index) })),
}));

export { MAIN_POOL };
