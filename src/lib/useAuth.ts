import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { cleanUserName } from "./userDisplay";

export interface Profile {
  id: string;
  phone: string;
  national_id: string;
  full_name: string;
  branch: string;
  role: "admin" | "branch" | "supervisor";
  requires_password_change: boolean;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    const next = data as Profile | null;
    if (next) {
      const { data: account } = await supabase.from("app_users")
        .select("first_name,last_name").eq("national_id", next.national_id).maybeSingle();
      const accountName = account ? cleanUserName(`${account.first_name ?? ""} ${account.last_name ?? ""}`) : "";
      next.full_name = accountName || cleanUserName(next.full_name);
    }
    setProfile(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setLoading(true);
        setTimeout(() => void loadProfile(s), 0);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadProfile(data.session);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  return { session, profile, loading, refresh: () => loadProfile(session) };
}
