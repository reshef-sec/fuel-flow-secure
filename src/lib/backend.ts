/**
 * Browser-only backend calls (Netlify-compatible: no app server).
 * Security lives in the database (security-definer RPCs from netlify_backend.sql)
 * and in the `admin-accounts` function deployed on the same database project.
 * Every export keeps the old `fn({ data })` call shape.
 */
import { supabase } from "./supabaseClient";
import { normalizePhone } from "./phoneLogin";

type FuelType = "בנזין" | "סולר";
export type Code = { serial: string; realCode: string; amount: number; fuelType: FuelType };
type Args<T> = { data: T };

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}

const mapCodes = (rows: unknown): Code[] =>
  ((rows as Record<string, any>[] | null) ?? []).map((r) => ({
    serial: String(r.serial),
    realCode: String(r.real_code ?? ""),
    amount: Number(r.amount ?? 0),
    fuelType: r.fuel_type === "סולר" ? "סולר" : "בנזין",
  }));

// ---------- Public employee link (/voucher/:id) ----------

export async function getWorkerLinkStatus({ data }: Args<{ id: string }>) {
  const r = await rpc<Record<string, any>>("worker_link_status", { p_id: data.id });
  if (!r?.exists) return { exists: false as const };
  return {
    exists: true as const,
    state: r.state as "ok" | "locked" | "expired",
    total: Number(r.total ?? 0),
    signed: Boolean(r.signed),
    employeeName: String(r.employee_name ?? ""),
  };
}

export async function openWorkerWallet({ data }: Args<{ id: string; workerId: string; phone: string }>) {
  const r = await rpc<Record<string, any>>("open_worker_wallet", {
    p_id: data.id, p_worker_id: data.workerId, p_phone: data.phone,
  });
  return {
    ok: Boolean(r?.ok),
    state: (r?.state ?? "invalid") as "ok" | "invalid" | "expired" | "locked" | "mismatch",
    attemptsLeft: Number(r?.attempts_left ?? 0),
    codes: mapCodes(r?.codes),
  };
}

export async function signWorkerLink({
  data,
}: Args<{ id: string; workerId: string; phone: string; fullName: string; signature: string }>) {
  const r = await rpc<Record<string, any>>("sign_worker_link", {
    p_id: data.id, p_worker_id: data.workerId, p_phone: data.phone,
    p_full_name: data.fullName, p_signature: data.signature,
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

// ---------- Accounts (need the secret key → admin-accounts function) ----------

type AccountInput = { phone: string; nationalId: string; fullName?: string; branch?: string; role?: string };

async function accounts(action: string, payload: Record<string, unknown>) {
  // Always send the signed-in user's token explicitly (the client may otherwise fall back to the public key).
  const { data: s } = await supabase.auth.getSession();
  let token = s.session?.access_token;
  if (!token && action === "change_password") {
    const { data: r } = await supabase.auth.refreshSession();
    token = r.session?.access_token;
    if (!token) throw new Error("פג תוקף ההתחברות — יש להתחבר מחדש");
  }
  const { data, error } = await supabase.functions.invoke("admin-accounts", {
    body: { action, ...payload },
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as { ok: boolean };
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
