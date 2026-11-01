import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "./useAuth";
import { useAppStore } from "@/store/appStore";
import { isPublicPath, isWorkerPublicPath } from "./publicPaths";
export { isPublicPath } from "./publicPaths";

type AuthValue = ReturnType<typeof useAuth>;
const AuthContext = createContext<AuthValue | null>(null);

export function useAuthContext() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuthContext outside AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const setRole = useAppStore((s) => s.setRole);
  const loaded = useAppStore((s) => s.loaded);
  const loadFromCloud = useAppStore((s) => s.loadFromCloud);
  const setIdentity = useAppStore((s) => s.setIdentity);
  useEffect(() => {
    setIdentity(auth.profile?.id ?? null, auth.profile?.national_id ?? null);
  }, [auth.profile?.id, auth.profile?.national_id, setIdentity]);
  const signedIn = Boolean(auth.session && auth.profile && !auth.profile.requires_password_change);

  useEffect(() => {
    if (signedIn && !loaded) void loadFromCloud();
  }, [signedIn, loaded, loadFromCloud]);
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    // Worker links never inherit staff login or mandatory password-change redirects.
    if (isWorkerPublicPath(pathname)) return;
    if (auth.loading) return;
    if (!auth.session || !auth.profile) {
      if (!isPublic) navigate({ to: "/login", replace: true });
      return;
    }
    if (auth.profile.requires_password_change) {
      if (pathname !== "/change-password") navigate({ to: "/change-password", replace: true });
      return;
    }
    // Non-admins always see the app as their own role.
    if (auth.profile.role !== "admin") setRole(auth.profile.role);
    if (pathname === "/login" || pathname === "/change-password") navigate({ to: "/", replace: true });
  }, [auth.loading, auth.session, auth.profile, pathname, isPublic, navigate, setRole]);

  const blocked =
    !isPublic &&
    pathname !== "/change-password" &&
    (auth.loading || !auth.profile || auth.profile.requires_password_change || !loaded);

  return (
    <AuthContext.Provider value={auth}>
      {blocked ? (
        <main className="grid min-h-screen place-items-center bg-background" aria-busy="true">
          <p className="text-sm font-semibold text-muted-foreground">בודק הרשאות…</p>
        </main>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
