import { useAuthContext } from "@/lib/auth-context";

export const SUPER_ADMIN_NAME = "מאיה קורן";
const norm = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

/** True only for the super admin account (exact full name, admin role). */
export function useIsSuperAdmin() {
  const { profile } = useAuthContext();
  if (!profile || profile.role !== "admin") return false;
  const n = norm(profile.full_name);
  return n === SUPER_ADMIN_NAME || n === "קורן מאיה";
}
