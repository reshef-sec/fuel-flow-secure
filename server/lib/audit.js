import { ActivityLog } from "../models.js";

const roleHe = { admin: "אדמין מרכזי", branch: "מנהל סניף", supervisor: "מפקח", viewer: "צופה" };
export const roleLabel = (r) => roleHe[r] ?? r ?? "";

/** Fire-and-forget audit entry; never throws. Pass `session` to commit atomically with a write. */
export function logAction(user, action, target, details, session) {
  const doc = {
    user_id: user?.id ?? null,
    user_name: user?.full_name || user?.phone || "—",
    role: roleLabel(user?.role),
    action,
    target: target || "-",
    details: details ?? null,
  };
  if (session) return ActivityLog.create([doc], { session });
  ActivityLog.create(doc).catch((e) => console.warn("activity_log insert failed:", e.message));
  return undefined;
}
