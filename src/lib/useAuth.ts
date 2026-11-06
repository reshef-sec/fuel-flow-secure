import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, emitAuthChange, onAuthChange } from "@/lib/apiClient";
import { cleanUserName } from "./userDisplay";

export type ProfileRole = "admin" | "branch" | "supervisor" | "viewer";

export interface Profile {
  id: string;
  phone: string;
  email: string;
  full_name: string;
  branch: string;
  role: ProfileRole;
  requires_password_change: boolean;
  is_first_login?: boolean;
  /** סביבת לימוד: true only for the system owner while the learning environment is active. */
  learning_mode?: boolean;
}

/** Truthy marker for "signed in" (the real session is an httpOnly cookie). */
export interface Session { user: { id: string } }

export { emitAuthChange };

/** POST /api/auth/login → profile. Throws with the server's Hebrew message. */
export async function signIn(identifier: string, password: string): Promise<Profile> {
  const { body, error } = await apiFetch<{ profile: Profile }>("/api/auth/login", { body: { identifier, password } });
  if (error || !body?.profile) throw new Error(error?.message || "הכניסה נכשלה");
  emitAuthChange();
  return body.profile;
}

/** POST /api/auth/logout; always notifies listeners so the UI returns to /login. */
export async function signOut() {
  await apiFetch("/api/auth/logout", { body: {} });
  emitAuthChange();
  // Full reload drops the in-memory store so the next user never sees the previous user's data.
  if (typeof window !== "undefined") window.location.assign("/login");
}

/** POST /api/auth/change-password. Throws with the server's Hebrew policy message. */
export async function changePassword(password: string): Promise<Profile | null> {
  const { body, error } = await apiFetch<{ ok: boolean; profile: Profile }>("/api/auth/change-password", { body: { password } });
  if (error) throw new Error(error.message);
  emitAuthChange();
  return body?.profile ?? null;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const signedIn = useRef(false);

  const loadProfile = useCallback(async () => {
    const { body } = await apiFetch<{ profile: Profile | null }>("/api/auth/me");
    const next = body?.profile ?? null;
    if (next) next.full_name = cleanUserName(next.full_name);
    setSession(next ? { user: { id: next.id } } : null);
    setProfile(next);
    signedIn.current = Boolean(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProfile();
    return onAuthChange(() => {
      // A re-check while signed in stays silent: the screen is not blanked for it.
      if (!signedIn.current) setLoading(true);
      void loadProfile();
    });
  }, [loadProfile]);

  return { session, profile, loading, refresh: loadProfile };
}
