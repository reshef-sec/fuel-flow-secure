import { create } from "zustand";

import clientsSeed from "@/data/clients.json";

import {
  MAIN_POOL,
  vouchers as seedVouchers,
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
}

const today = () => new Date().toISOString().slice(0, 10);

/** Real clients & sites list (מס' לקוח, שם לקוח, מספר אתר, שם אתר). */
const seedClients: ClientRecord[] = clientsSeed as ClientRecord[];

const seedBranches: BranchRecord[] = [
  { id: "b1", name: "הנהלה", manager: "רון קלדרון", city: "מטה" },
  { id: "b2", name: "צפון", manager: "גיא שכטר", city: "עפולה" },
  { id: "b3", name: "מרכז", manager: "עופר קשי", city: "תל אביב" },
  { id: "b4", name: "ירושלים", manager: "עידן כהן", city: "ירושלים" },
  { id: "b5", name: "דרום", manager: "חיים אלמקייס", city: "באר שבע" },
  { id: "b6", name: "שפלה", manager: "אבי ממן", city: "רחובות" },
  { id: "b7", name: "מוקד", manager: "ליאור משה", city: "לוד" },
];

/** Static list kept for forms that only need branch names. */
export const branches = seedBranches.map((b) => b.name);

interface AppState {
  role: Role;
  setRole: (role: Role) => void;

  balance: number;
  vouchers: VoucherRecord[];
  allocate: (branch: string, supervisor: string | undefined, amount: number) => void;
  assignToSupervisor: (branch: string, supervisor: string, amount: number) => void;
  markPazRedeemed: (count: number) => number;
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
  importVouchers: (rows) => set((s) => ({ vouchers: [...rows, ...s.vouchers] })),


  users: [
    { branch: "הנהלה", id: "032957615", lastName: "בני", firstName: "תמי", role: "admin", title: "בקרת חוזים ושכר", phone: "0506350222" },
    { branch: "הנהלה", id: "301140471", lastName: "קלדרון", firstName: "רון", role: "admin", title: "מנהל מחלקת רכש ולוגיסטיקה", phone: "0508574322" },
    { branch: "הנהלה", id: "316269109", lastName: "נמדר", firstName: "שגאל", role: "admin", title: "מחלקת רכש ולוגיסטיקה", phone: "0502099132" },
    { branch: "הנהלה", id: "059698035", lastName: "לוגסי", firstName: "איתן", role: "admin", title: "מנהל תפעול מחלקת רכב", phone: "0543277902" },
    { branch: "דרום", id: "023009426", lastName: "אלמקייס", firstName: "חיים", role: "branch", title: "מנהל סניף", phone: "0537709916" },
    { branch: "דרום", id: "208268425", lastName: "רבינוביץ", firstName: "אבי", role: "branch", title: "ס.מנהל סניף", phone: "0544628413" },
    { branch: "הנהלה", id: "203203419", lastName: "בוטה", firstName: "חגי", role: "branch", title: "קצין תעבורה", phone: "0528745060" },
    { branch: "ירושלים", id: "201611548", lastName: "זיאת", firstName: "שלומי", role: "branch", title: "סגן מנהל סניף", phone: "0544721440" },
    { branch: "ירושלים", id: "300349784", lastName: "כהן", firstName: "עידן", role: "branch", title: "מנהל סניף", phone: "0587626041" },
    { branch: "מוקד", id: "201386620", lastName: "משה", firstName: "ליאור", role: "branch", title: "בקרת אגף", phone: "0504772224" },
    { branch: "מרכז", id: "066064601", lastName: "קשי", firstName: "עופר", role: "branch", title: "מנהל סניף", phone: "0537398436" },
    { branch: "צפון", id: "034044487", lastName: "לוי", firstName: "אדיר", role: "branch", title: "סגן מנהל סניף", phone: "050-8574332" },
    { branch: "צפון", id: "034161000", lastName: "שכטר", firstName: "גיא", role: "branch", title: "מנהל סניף", phone: "050-2099125" },
    { branch: "שפלה", id: "031736465", lastName: "ממן", firstName: "אבי", role: "branch", title: "סגן מנהל מרחב שפלה-מרכז", phone: "0534443031" },
    { branch: "ירושלים", id: "021979869", lastName: "כתב", firstName: "חופית", role: "supervisor", title: 'קב"ט עוטף-מ"י', phone: "0549196365" },
    { branch: "ירושלים", id: "031946742", lastName: "אלאל", firstName: "חגי", role: "supervisor", title: "מפקח גזר", phone: "0509304030" },
    { branch: "ירושלים", id: "043369339", lastName: "אזרואל", firstName: "מאיר", role: "supervisor", title: "מפקח ירושלים", phone: "0544543629" },
    { branch: "ירושלים", id: "060170990", lastName: "פריד", firstName: "גלי", role: "supervisor", title: "מנהל מפעל ראוי", phone: "0506532340" },
    { branch: "ירושלים", id: "203077375", lastName: "חמו", firstName: "אור", role: "supervisor", title: 'מפקח מוס"ח מעלה אדומים', phone: "0542528330" },
    { branch: "ירושלים", id: "205639032", lastName: "שער", firstName: "אושר", role: "supervisor", title: "מפקח מ.א גזר", phone: "0546752808" },
    { branch: "ירושלים", id: "211772520", lastName: "סופר", firstName: "איתי", role: "supervisor", title: "כוח אדם עוטף ירושלים", phone: "0545919100" },
    { branch: "ירושלים", id: "212541163", lastName: "חטיבי", firstName: "ניר", role: "supervisor", title: "מפקח לילה + רכז רכבים", phone: "0547305104" },
    { branch: "ירושלים", id: "300116993", lastName: "אלקיקין", firstName: "תמיר", role: "supervisor", title: 'אחמ"ש - בניני האומה', phone: "0526344801" },
    { branch: "ירושלים", id: "300642220", lastName: "גל", firstName: "כפיר", role: "supervisor", title: 'מפקח מוס"ח ירושלים', phone: "0524883719" },
    { branch: "ירושלים", id: "300779220", lastName: "שמחה", firstName: "שוולטר", role: "supervisor", title: "מנהל יחידת תחבצ", phone: "0506286933" },
    { branch: "ירושלים", id: "305536906", lastName: "בר חן", firstName: "רבקה", role: "supervisor", title: "מפקח ירושלים", phone: "0502235200" },
    { branch: "ירושלים", id: "314766403", lastName: "אברהמי", firstName: "ליאור", role: "supervisor", title: "כוח אדם עוטף ירושלים", phone: "0534265220" },
    { branch: "ירושלים", id: "327127965", lastName: "רבינוביץ", firstName: "אלון", role: "supervisor", title: "מפקח ירושלים", phone: "0538289299" },
    { branch: "ירושלים", id: "332719418", lastName: "בנימינוב", firstName: "נאום", role: "supervisor", title: "מפקח מודיעין", phone: "0502099149" },
    { branch: "מרכז", id: "028547099", lastName: "נגר", firstName: "רביב", role: "supervisor", title: "מפקח מרכז", phone: "0509744445" },
    { branch: "צפון", id: "028842714", lastName: "עמר", firstName: "איציק", role: "supervisor", title: "מפקח ב.ל", phone: "054-6929032" },
    { branch: "צפון", id: "029675782", lastName: "כריסטובל", firstName: "ויטלי", role: "supervisor", title: "מזכירה", phone: "050-7540499" },
    { branch: "צפון", id: "033237454", lastName: "שני", firstName: "רפי", role: "supervisor", title: "מפקח", phone: "053-2407084" },
    { branch: "צפון", id: "305051377", lastName: "שוורץ", firstName: "יוסף", role: "supervisor", title: "מפקח", phone: "053-4923308" },
    { branch: "צפון", id: "305476053", lastName: "יצחק", firstName: "רמי", role: "supervisor", title: "מפקח", phone: "054-7341227" },
    { branch: "צפון", id: "039294970", lastName: "גאנם", firstName: "מאהר", role: "supervisor", title: "מפקח", phone: "050-5903350" },
    { branch: "צפון", id: "039703178", lastName: "לוי", firstName: "אליץ", role: "supervisor", title: "מפקח ב.ל", phone: "054-6897628" },
    { branch: "ירושלים", id: "302115191", lastName: "ברזל", firstName: "אוהד", role: "supervisor", title: "מפקח", phone: "052-6404004" },
    { branch: "צפון", id: "308468487", lastName: "אחיטוב", firstName: "מוריה", role: "supervisor", title: "מפקחת", phone: "050-5114646" },
    { branch: "צפון", id: "324914803", lastName: "לוי", firstName: "אביב", role: "supervisor", title: "מפקח", phone: "052-2357626" },
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

  clients: seedClients,
  addClient: (client) => set((s) => ({ clients: [client, ...s.clients] })),
  /** Merges imported rows, replacing existing client+site combinations. */
  importClients: (rows) =>
    set((s) => {
      const keys = new Set(rows.map((r) => `${r.clientId}|${r.siteId}`));
      return { clients: [...rows, ...s.clients.filter((c) => !keys.has(`${c.clientId}|${c.siteId}`))] };
    }),
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
