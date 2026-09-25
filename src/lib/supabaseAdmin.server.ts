import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EXTERNAL_SUPABASE_ANON_KEY, EXTERNAL_SUPABASE_URL } from "./supabaseClient";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client for the external project. Server only. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAdmin(): SupabaseClient<any> {
  const key = process.env["EXTERNAL_SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("חסר מפתח שרת (EXTERNAL_SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(EXTERNAL_SUPABASE_URL, key, opts);
}

/** Client acting as the caller (RLS applies). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getUserClient(token: string): SupabaseClient<any> {
  return createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
    ...opts,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
