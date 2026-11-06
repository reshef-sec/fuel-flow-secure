/**
 * Backend calls to the same-origin Express API (server/app.js).
 * Security lives on the server (RPC ports in server/rpc, accounts in server/routes/accounts.js).
 * Every export keeps the old `fn({ data })` call shape.
 */
import { api, apiFetch } from "./apiClient";
import { normalizePhone } from "./phoneLogin";

type FuelType = "בנזין" | "סולר";
export type Code = { serial: string; realCode: string; amount: number; fuelType: FuelType; revealed: boolean };
type Args<T> = { data: T };

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await api.rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}

const mapCodes = (rows: unknown): Code[] =>
  ((rows as Record<string, any>[] | null) ?? []).map((r) => ({
    serial: String(r.serial),
    realCode: String(r.real_code ?? ""),
    revealed: r.revealed === true,
    amount: Number(r.amount ?? 0),
    fuelType: r.fuel_type === "סולר" ? "סולר" : "בנזין",
  }));

// ---------- Public employee link (/voucher/:id) ----------

/** `p_demo: true` only for learning-environment links (…?demo=1); without `demo` the params are unchanged. */
const demoParam = (demo?: boolean) => (demo === true ? { p_demo: true } : {});

export async function getWorkerLinkStatus({ data }: Args<{ id: string; demo?: boolean }>) {
  const r = await rpc<Record<string, any>>("worker_link_status", { p_id: data.id, ...demoParam(data.demo) });
  if (!r?.exists) return { exists: false as const };
  return {
    exists: true as const,
    state: r.state as "ok" | "locked" | "expired",
    total: Number(r.total ?? 0),
    signed: Boolean(r.signed),
    employeeName: String(r.employee_name ?? ""),
  };
}

export async function openWorkerWallet({ data }: Args<{ id: string; workerId: string; phone: string; demo?: boolean }>) {
  const r = await rpc<Record<string, any>>("open_worker_wallet", {
    p_id: data.id, p_worker_id: data.workerId, p_phone: data.phone, ...demoParam(data.demo),
  });
  return {
    ok: Boolean(r?.ok),
    state: (r?.state ?? "invalid") as "ok" | "invalid" | "expired" | "locked" | "mismatch",
    attemptsLeft: Number(r?.attempts_left ?? 0),
    codes: mapCodes(r?.codes),
  };
}

/** Reveals one code, permanently; the server re-checks the employee's identity. */
export async function revealWorkerCode({ data }: Args<{ id: string; workerId: string; phone: string; serial: string; demo?: boolean }>) {
  const r = await rpc<Record<string, any>>("reveal_worker_code", {
    p_id: data.id, p_worker_id: data.workerId, p_phone: data.phone, p_serial: data.serial, ...demoParam(data.demo),
  });
  return {
    ok: Boolean(r?.ok),
    state: (r?.state ?? "invalid") as "ok" | "invalid" | "expired" | "locked" | "mismatch",
    code: r?.code ? mapCodes([r.code])[0] : null,
  };
}

export async function signWorkerLink({
  data,
}: Args<{ id: string; workerId: string; phone: string; fullName: string; signature: string; demo?: boolean }>) {
  const r = await rpc<Record<string, any>>("sign_worker_link", {
    p_id: data.id, p_worker_id: data.workerId, p_phone: data.phone,
    p_full_name: data.fullName, p_signature: data.signature, ...demoParam(data.demo),
  });
  return { ok: Boolean(r?.ok), codes: mapCodes(r?.codes) };
}

// ---------- Staff ----------

export async function unlockWorkerLink({ data }: Args<{ id: string }>) {
  await rpc("unlock_worker_link", { p_id: data.id });
  return { ok: true as const };
}

export async function lookupAuthId({ data }: Args<{ nationalId: string }>) {
  const id = await rpc<string | null>("lookup_auth_id", { p_national_id: data.nationalId });
  return { id: id ?? null };
}

export async function getSetupStatus() {
  const needs = await rpc<boolean>("needs_setup", {});
  return { needsSetup: Boolean(needs) };
}

// ---------- Accounts (POST /api/accounts) ----------

type AccountInput = { phone: string; nationalId: string; fullName?: string; branch?: string; role?: string };

async function accounts(action: string, payload: Record<string, unknown>) {
  // Same-origin call; the httpOnly session cookie authenticates it.
  const { body, error } = await apiFetch<{ ok?: boolean; error?: string }>("/api/accounts", { body: { action, ...payload } });
  if (error) {
    if (error.status === 401 && action !== "bootstrap" && action !== "activate") throw new Error("פג תוקף ההתחברות — יש להתחבר מחדש");
    throw new Error(error.message);
  }
  if (body?.error) throw new Error(body.error);
  return body as { ok: boolean };
}

const norm = (d: AccountInput) => ({ ...d, phone: normalizePhone(d.phone) });

export const bootstrapAdmin = ({ data }: Args<Omit<AccountInput, "role">>) => accounts("bootstrap", norm(data));
export async function activateAccount(phone: string, nationalId: string) {
  try {
    const r = await accounts("activate", { phone: normalizePhone(phone), nationalId });
    return Boolean(r?.ok);
  } catch { return false; }
}
export const syncAccount = ({ data }: Args<AccountInput>) => accounts("sync", norm(data));
export const resetAccountPassword = ({ data }: Args<AccountInput>) => accounts("reset", norm(data));
export const deleteAccount = ({ data }: Args<{ nationalId: string }>) => accounts("delete", data);
export const completePasswordChange = ({ data }: Args<{ password: string }>) => accounts("change_password", data);

// Authorization is decided server-side (can_use_development_tools).
export const getDevelopmentToolsAccess = () => rpc<boolean>("can_use_development_tools", {});
export const generateDemoData = () => rpc<{ vouchers_created: number }>("generate_demo_data", {});
export const resetSystemData = (confirmation: string) => rpc<void>("reset_development_data", { p_confirmation: confirmation });

export interface VehicleSyncResult { added: number; updated: number; deactivated: number; duplicates?: number; blanks?: number; invalid?: number; skipped?: number; active?: number; reactivated?: number; remained_active?: number }
export const syncWorkVehicles = (rows: Record<string, unknown>[]) =>
  rpc<VehicleSyncResult>("sync_work_vehicles", { p_rows: rows });
export const syncPrivateVehicles = (rows: Record<string, unknown>[]) =>
  rpc<VehicleSyncResult>("sync_private_vehicles", { p_rows: rows });
export const syncVehiclePool = (pool: "regular" | "b2b", rows: Record<string, unknown>[]) =>
  rpc<VehicleSyncResult>("sync_vehicle_pool", { p_pool: pool, p_rows: rows });
export const importVoucherInventory = (rows: Record<string, unknown>[]) =>
  rpc<{ added: number; skipped: number; serials: string[] }>("import_voucher_inventory", { p_rows: rows });
export const reconcilePazFeedback = (serials: string[]) =>
  rpc<number>("reconcile_redeemed_vouchers", { card_numbers: serials });
