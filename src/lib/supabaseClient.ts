import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// External Supabase project (public URL + anon key are safe to ship to the browser).
export const EXTERNAL_SUPABASE_URL =
  import.meta.env["VITE_EXTERNAL_SUPABASE_URL"] ||
  (import.meta.env["VITE_STATIC_SPA"] ? import.meta.env["VITE_SUPABASE_URL"] : "") || "https://lmnszsgrptpgnpqpxrnf.supabase.co";
export const EXTERNAL_SUPABASE_ANON_KEY =
  import.meta.env["VITE_EXTERNAL_SUPABASE_ANON_KEY"] ||
  (import.meta.env["VITE_STATIC_SPA"] ? import.meta.env["VITE_SUPABASE_ANON_KEY"] : "") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbnN6c2dycHRwZ25wcXB4cm5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMDAyMTUsImV4cCI6MjEwNTg3NjIxNX0.LP0kI3wkr5NsJnk3On8fNu-eNzu-cmN2NahkVNBpSnc";

let _client: SupabaseClient | undefined;
function get(): SupabaseClient {
  if (!_client) {
    const isBrowser = typeof window !== "undefined";
    _client = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
        storageKey: "reshef-external-auth",
      },
    });
  }
  return _client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any> = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const c = get();
    const v = Reflect.get(c, prop, c);
    return typeof v === "function" ? v.bind(c) : v;
  },
});
