import { useEffect, useState } from "react";
import { useAuthContext } from "@/lib/auth-context";
import { getDevelopmentToolsAccess } from "@/lib/backend";
import { canUseDevelopmentTools } from "@/lib/developmentAccess";

/** One server check per signed-in user id (shared by the layout and the settings panel). */
const checks = new Map<string, Promise<boolean>>();
/** Settled answers, so pages mounted later start with the known result (keeps the role simulator stable across navigation). */
const verified = new Map<string, boolean>();
function checkAccess(userId: string) {
  let p = checks.get(userId);
  if (!p) {
    p = getDevelopmentToolsAccess().then((allowed) => {
      verified.set(userId, allowed === true);
      return allowed === true;
    });
    // Never cache a failure: a later mount may retry.
    p.catch(() => checks.delete(userId));
    checks.set(userId, p);
  }
  return p;
}

/**
 * Development tools access, decided only by the server RPC `can_use_development_tools`.
 * Fails closed: false while loading, on error, or for any other signed-in user.
 */
export function useDevelopmentToolsAccess() {
  const { session } = useAuthContext();
  const userId = session?.user.id;
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(() =>
    userId && verified.get(userId) === true ? userId : null);

  useEffect(() => {
    let cancelled = false;
    if (!(userId && verified.get(userId) === true)) setVerifiedUserId(null);
    if (userId) void checkAccess(userId).then((allowed) => {
      if (!cancelled) setVerifiedUserId(allowed ? userId : null);
    }).catch(() => { /* Denied or unavailable: stay hidden. */ });
    return () => { cancelled = true; };
  }, [userId]);

  return canUseDevelopmentTools(userId, verifiedUserId);
}

/** The super admin (role simulator + development tools): an admin the server verifies. */
export function useIsSuperAdmin() {
  const { profile } = useAuthContext();
  const allowed = useDevelopmentToolsAccess();
  return Boolean(profile && profile.role === "admin" && allowed);
}
