import { toast } from "sonner";
import { api } from "@/lib/apiClient";
import { notifyCentralInventoryChanged } from "@/lib/centralInventorySummary";
import { normalizeVoucherStatus } from "@/lib/importIntegrity";
import type { VoucherRecord } from "@/components/dashboard/voucherData";
import type {
  B2BClientRecord,
  BranchRecord,
  ClientRecord,
  ReasonRecord,
  UserRecord,
  VoucherRequest,
  WorkerLink,
} from "@/store/appStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = api as any;
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));

/** Runs a cloud write and reports failures to the user. */
export function run(p: PromiseLike<{ error: { message: string } | null }>) {
  void Promise.resolve(p).then(({ error }) => {
    if (error) toast.error(`שמירה בענן נכשלה: ${error.message}`);
    else notifyCentralInventoryChanged();
  });
}

/* ---------- mappers ---------- */
export const voucherToRow = (v: VoucherRecord) => ({
  serial: v.serial, real_code: "", amount: v.amount, fuel_type: v.fuelType ?? "בנזין", branch: v.branch,
  supervisor: v.supervisor ?? null, client: v.client ?? null, status: v.status, updated_on: v.updatedAt,
  requester: v.requester ?? null, approver: v.approver ?? null, client_id: v.clientId ?? null,
  site_id: v.siteId ?? null, site_name: v.siteName ?? null, reason: v.reason ?? null,
  worker_name: v.workerName ?? null, worker_id: v.workerId ?? null, delivered_at: v.deliveredAt ?? null,
  route: v.route ?? null, link_id: v.linkId ?? null, client_code: v.clientCode ?? null,
  account_name: v.accountName ?? null, standard: v.standard ?? null, license_plate: v.licensePlate ?? null,
  driver_name: v.driverName ?? null, standard_name: v.standardName ?? null,
  employee_name: v.workerName ?? null, employee_id: v.workerId ?? null, employee_phone: v.workerPhone ?? null,
  issue_reason: v.reason ?? null, issued_at: v.issuedAt ?? null, expires_at: v.expiresAt ?? null,
  supervisor_id: v.supervisorId ?? null,
});
const rowToVoucher = (r: Row, codes: Map<string, string>): VoucherRecord => {
  const v: Row = {
    serial: r.serial, realCode: codes.get(String(r.serial)) ?? "", amount: Number(r.amount),
    branch: r.branch ?? "מאגר ראשי", status: normalizeVoucherStatus(r.status), redeemedAt: s(r.redeemed_at),
    fuelType: r.fuel_type === "סולר" ? "סולר" : "בנזין",
    updatedAt: r.updated_on, supervisor: s(r.supervisor), client: s(r.client), requester: s(r.requester),
    approver: s(r.approver), clientId: s(r.client_id), siteId: s(r.site_id), siteName: s(r.site_name),
    reason: s(r.issue_reason) ?? s(r.reason), workerName: s(r.employee_name) ?? s(r.worker_name),
    workerId: s(r.employee_id) ?? s(r.worker_id), workerPhone: s(r.employee_phone),
    issuedAt: s(r.issued_at), expiresAt: s(r.expires_at), supervisorId: s(r.supervisor_id),
    deliveredAt: s(r.delivered_at), route: s(r.route), linkId: s(r.link_id), clientCode: s(r.client_code),
    accountName: s(r.account_name), standard: s(r.standard), licensePlate: s(r.license_plate),
    driverName: s(r.driver_name), standardName: s(r.standard_name),
  };
  Object.keys(v).forEach((k) => v[k] === undefined && delete v[k]);
  return v as unknown as VoucherRecord;
};

export const userToRow = (u: UserRecord) => ({
  id: u.id, email: u.email || null, last_name: u.lastName, first_name: u.firstName, role: u.role, title: u.title,
  phone: u.phone, branch: u.branch, can_request: !!u.canRequest,
  requires_password_change: u.requiresPasswordChange ?? true,
});
export const userPatch = (p: Partial<UserRecord>) => {
  const m: Row = {};
  if (p.email !== undefined) m.email = p.email || null;
  if (p.lastName !== undefined) m.last_name = p.lastName;
  if (p.firstName !== undefined) m.first_name = p.firstName;
  if (p.role !== undefined) m.role = p.role;
  if (p.title !== undefined) m.title = p.title;
  if (p.phone !== undefined) m.phone = p.phone;
  if (p.branch !== undefined) m.branch = p.branch;
  if (p.canRequest !== undefined) m.can_request = p.canRequest;
  if (p.requiresPasswordChange !== undefined) m.requires_password_change = p.requiresPasswordChange;
  return m;
};

export const clientToRow = (c: ClientRecord) => ({
  client_id: c.clientId, client_name: c.clientName, site_id: c.siteId, site_name: c.siteName,
  standard: c.standard ?? null, is_active: c.isActive !== false,
});
export const b2bToRow = (c: B2BClientRecord) => ({
  client_code: c.clientCode, account_name: c.accountName, client_name: c.clientName, branch: c.branch,
  standard: c.standard, balance: c.balance ?? null, load_type: c.loadType ?? null,
  budget_section: c.budgetSection ?? null, account_key: c.accountKey ?? null,
  item_family: c.itemFamily ?? null, account_status: c.accountStatus ?? null,
  account_type: c.accountType ?? null, is_active: c.isActive !== false,
});
export const requestToRow = (r: VoucherRequest) => ({
  id: r.id, requester: r.requester, requester_id: r.requesterId, branch: r.branch, amount: r.amount,
  reason: r.reason, created_on: r.createdAt, status: r.status,
  approved_amount: r.approvedAmount ?? null, approver: r.approver ?? null,
  benzine_amount: r.benzineAmount ?? null, diesel_amount: r.dieselAmount ?? null,
});
export const linkToRow = (l: WorkerLink) => ({
  id: l.id, total: l.total, serials: l.serials, created_on: l.createdAt,
  worker_id: l.workerId ?? null, phone: l.phone ?? null, signed_at: l.signedAt ?? null,
  employee_name: l.employeeName ?? null, branch: l.branch ?? null, supervisor_id: l.supervisorId ?? null,
});

const PAGE = 5000;

/** Reads a whole table in pages (the API returns at most 5,000 rows per call). */
async function all(table: string, order?: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select("*").range(from, from + PAGE - 1);
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** What every screen needs before it can open: small tables only. */
export async function loadEssentials() {
  const [branches, reasons, users, requests, settings] = await Promise.all([
    all("branches", "created_at"), all("issue_reasons", "created_at"), all("app_users", "created_at"),
    all("voucher_requests", "created_at"), all("app_settings"),
  ]);
  return {
    branchList: branches.map((r) => ({ id: String(r.id), name: String(r.name), manager: String(r.manager), city: String(r.city) })) as BranchRecord[],
    reasons: reasons.map((r) => ({ id: String(r.id), name: String(r.name), category: r.category === "B2B" ? "B2B" : "Regular" })) as ReasonRecord[],
    users: users.map((r) => ({
      id: String(r.id), email: String(r.email ?? ""), lastName: String(r.last_name), firstName: String(r.first_name),
      role: r.role as UserRecord["role"], title: String(r.title), phone: String(r.phone), branch: String(r.branch),
      canRequest: !!r.can_request, requiresPasswordChange: !!r.requires_password_change,
    })).reverse() as UserRecord[],
    requests: requests.map((r) => ({
      id: String(r.id), requester: String(r.requester), requesterId: String(r.requester_id), branch: String(r.branch),
      amount: Number(r.amount), reason: String(r.reason), createdAt: String(r.created_on),
      status: r.status as VoucherRequest["status"],
      approvedAmount: r.approved_amount == null ? undefined : Number(r.approved_amount), approver: s(r.approver),
      ...(r.benzine_amount != null || r.diesel_amount != null
        ? { benzineAmount: Number(r.benzine_amount ?? 0), dieselAmount: Number(r.diesel_amount ?? 0) }
        : {}),
    })).reverse() as VoucherRequest[],
    balance: Number(settings.find((r) => r.key === "main")?.balance ?? 0),
  };
}

/** The large tables. They load after the app has opened, so no screen waits for them. */
export async function loadStock() {
  const [b2b, clients, vouchers, links] = await Promise.all([
    all("b2b_clients", "created_at"), all("regular_clients", "created_at"),
    all("vouchers", "created_at"), all("worker_links", "created_at"),
  ]);
  // Redemption codes are never loaded into the staff app; only the employee page reads them server-side.
  const codes = new Map<string, string>();
  return {
    b2bClients: b2b.map((r) => ({
      clientCode: String(r.client_code), accountName: String(r.account_name), clientName: String(r.client_name),
      branch: String(r.branch), standard: String(r.standard), balance: s(r.balance), loadType: s(r.load_type),
      budgetSection: s(r.budget_section), accountKey: s(r.account_key), itemFamily: s(r.item_family),
      accountStatus: s(r.account_status), accountType: s(r.account_type), isActive: r.is_active === true,
    })) as B2BClientRecord[],
    nonB2bClients: clients.map((r) => ({
      clientId: String(r.client_id), clientName: String(r.client_name), siteId: String(r.site_id),
      siteName: String(r.site_name), standard: s(r.standard), isActive: r.is_active === true,
    })) as ClientRecord[],
    vouchers: vouchers.map((r) => rowToVoucher(r, codes)).reverse(),
    links: links.map((r) => ({
      id: String(r.id), total: Number(r.total), serials: (r.serials as string[]) ?? [], createdAt: String(r.created_on),
      workerId: s(r.worker_id), phone: s(r.phone), signedAt: s(r.signed_at),
      employeeName: s(r.employee_name), branch: s(r.branch), supervisorId: s(r.supervisor_id),
      locked: Boolean(r.locked) || Number(r.failed_attempts ?? 0) >= 3,
    })).reverse() as WorkerLink[],
  };
}

/** Reload physical stock before issuing, without reading redemption codes. */
export async function loadIssuanceStock(): Promise<VoucherRecord[]> {
  return (await all("vouchers", "serial")).map(r => rowToVoucher(r, new Map()));
}

export { db };
