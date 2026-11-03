import { fullName, type UserRecord } from "@/store/appStore";
import { branchLabel, CENTRAL_POOL_LABEL } from "@/lib/branchLabels";

/**
 * Admin allocation recipients: branch managers (role "branch") and users allowed to raise a voucher
 * request ("רשאי להקים דרישה"). The read-only viewer is never a recipient, nor is anyone without a
 * real branch (stock can't be "allocated" back to the central pool).
 */
export function isAdminRecipient(u: UserRecord): boolean {
  if (u.role === "viewer") return false;
  if (u.role !== "branch" && !u.canRequest) return false;
  return branchLabel(u.branch) !== CENTRAL_POOL_LABEL;
}

/**
 * Maps a recipient to the exact (branch, supervisor) pair the previous AllocationDialog passed to
 * `allocate` → `transferInventory(items, branch, supervisor)`:
 *  - supervisor user  → (u.branch, fullName(u))   — the old "branch (supervisor)" target
 *  - anyone else      → (u.branch, undefined)      — the old plain-branch target / request approvals
 * The server-side transfer_voucher_stock contract is therefore unchanged.
 */
export function recipientTarget(u: UserRecord): { branch: string; supervisor?: string } {
  return u.role === "supervisor" ? { branch: u.branch, supervisor: fullName(u) } : { branch: u.branch };
}

export function recipientRoleText(u: UserRecord): string {
  if (u.role === "branch") return "מנהל סניף";
  if (u.role === "supervisor") return u.canRequest ? "מפקח · מורשה דרישה" : "מפקח";
  return "מורשה דרישה";
}

export const adminRecipients = (users: UserRecord[]) =>
  users
    .filter(isAdminRecipient)
    .sort((a, b) => branchLabel(a.branch).localeCompare(branchLabel(b.branch), "he") || (a.role === "branch" ? -1 : 0) - (b.role === "branch" ? -1 : 0) || fullName(a).localeCompare(fullName(b), "he"));
