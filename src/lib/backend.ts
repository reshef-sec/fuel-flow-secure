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
    state: r.state as "ok" | "expired",
    total: Number(r.total ?? 0),
    signed: Boolean(r.signed),
    employeeName: String(r.employee_name ?? ""),
    reachable: Boolean(r.reachable),
  };
}

export async function verifyWorkerOtp({ data }: Args<{ id: string; code: string; demo?: boolean }>) {
  const r = await rpc<Record<string, any>>("verify_worker_otp", { p_id: data.id, p_code: data.code, ...demoParam(data.demo) });
  return {
    ok: Boolean(r?.ok),
    state: (r?.state ?? "wrong") as "wrong" | "new_code_needed" | "expired",
    attemptsLeft: Number(r?.attempts_left ?? 0),
    session: String(r?.session ?? ""),
    signed: Boolean(r?.signed),
  };
}

export async function requestWorkerOtp({ data }: Args<{ id: string }>) {
  const r = await rpc<Record<string, any>>("request_worker_otp", { p_id: data.id });
  return { ok: Boolean(r?.ok), state: (r?.state ?? "unavailable") as "wait" | "unavailable" };
}

export async function openWorkerWallet({ data }: Args<{ id: string; session: string; demo?: boolean }>) {
  const r = await rpc<Record<string, any>>("open_worker_wallet", { p_id: data.id, p_session: data.session, ...demoParam(data.demo) });
  return { ok: Boolean(r?.ok), codes: mapCodes(r?.codes) };
}

/** Reveals one code, permanently; the server checks this device's session. */
export async function revealWorkerCode({ data }: Args<{ id: string; session: string; serial: string; demo?: boolean }>) {
  const r = await rpc<Record<string, any>>("reveal_worker_code", {
    p_id: data.id, p_session: data.session, p_serial: data.serial, ...demoParam(data.demo),
  });
  return { ok: Boolean(r?.ok), code: r?.code ? mapCodes([r.code])[0] : null };
}

export async function signWorkerLink({ data }: Args<{ id: string; session: string; signature: string; demo?: boolean }>) {
  const r = await rpc<Record<string, any>>("sign_worker_link", {
    p_id: data.id, p_session: data.session, p_signature: data.signature, ...demoParam(data.demo),
  });
  return { ok: Boolean(r?.ok), codes: mapCodes(r?.codes) };
}

// ---------- Staff ----------

/** Sends the employee a new code, optionally to a corrected phone. Returns the code if SMS could not. */
export async function resendWorkerSms({ data }: Args<{ id: string; phone: string }>) {
  const r = await rpc<{ sms_sent?: boolean; otp?: string }>("resend_worker_sms", { p_id: data.id, p_phone: data.phone });
  return { smsSent: Boolean(r?.sms_sent), otp: r?.otp ?? null };
}

/** What the login screen may offer. */
export async function getAuthOptions() {
  const { body } = await apiFetch<{ microsoft?: boolean; google?: boolean }>("/api/auth/options");
  return { microsoft: body?.microsoft === true, google: body?.google === true };
}

export async function getSetupStatus() {
  const needs = await rpc<boolean>("needs_setup", {});
  return { needsSetup: Boolean(needs) };
}

// ---------- Accounts (POST /api/accounts) ----------

type AccountInput = { id: string; email: string; phone: string; fullName?: string; branch?: string; role?: string };

async function accounts(action: string, payload: Record<string, unknown>) {
  // Same-origin call; the httpOnly session cookie authenticates it.
  const { body, error } = await apiFetch<{ ok?: boolean; error?: string; temporaryPassword?: string }>("/api/accounts", { body: { action, ...payload } });
  if (error) {
    if (error.status === 401 && action !== "bootstrap") throw new Error("פג תוקף ההתחברות — יש להתחבר מחדש");
    throw new Error(error.message);
  }
  if (body?.error) throw new Error(body.error);
  return body as { ok: boolean; temporaryPassword?: string };
}

const norm = (d: AccountInput) => ({ ...d, phone: normalizePhone(d.phone) });

export const bootstrapAdmin = ({ data }: Args<{ email: string; password: string; fullName: string }>) => accounts("bootstrap", data);
export const syncAccount = ({ data }: Args<AccountInput>) => accounts("sync", norm(data));
export const resetAccountPassword = ({ data }: Args<AccountInput>) => accounts("reset", norm(data));
export const deleteAccount = ({ data }: Args<{ id: string }>) => accounts("delete", data);
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
