import { create } from "zustand";

import { vouchers as seedVouchers, type VoucherRecord } from "@/components/dashboard/voucherData";

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

export const branches = ["סניף מרכז", "סניף צפון", "סניף דרום", "סניף ירושלים", "סניף חיפה"];

const today = () => new Date().toISOString().slice(0, 10);

interface AppState {
  role: Role;
  setRole: (role: Role) => void;

  balance: number;
  vouchers: VoucherRecord[];
  allocate: (target: string, amount: number) => void;
  importVouchers: (rows: VoucherRecord[]) => void;

  users: UserRecord[];
  addUser: (user: UserRecord) => void;
  removeUser: (id: string) => void;

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
  allocate: (target, amount) =>
    set((s) => {
      const count = Math.floor(amount / 100);
      const created: VoucherRecord[] = Array.from({ length: count }, (_, i) => ({
        serial: String(Math.floor(100000 + Math.random() * 899999) + i),
        amount: 100,
        assignedTo: target,
        status: "הוקצה לעובד",
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
    { id: "201998432", name: "דן מזרחי", phone: "050-9988776", role: "supervisor", branch: "סניף דרום" },
  ],
  addUser: (user) => set((s) => ({ users: [user, ...s.users] })),
  removeUser: (id) => set((s) => ({ users: s.users.filter((u) => u.id !== id) })),

  reasons: ["חידוש מלאי שוטף", "הקצאה חד פעמית", "סיור ניידות", "אירוע חריג"],
  addReason: (reason) => set((s) => ({ reasons: [...s.reasons, reason] })),
  updateReason: (index, reason) =>
    set((s) => ({ reasons: s.reasons.map((r, i) => (i === index ? reason : r)) })),
  removeReason: (index) => set((s) => ({ reasons: s.reasons.filter((_, i) => i !== index) })),
}));
