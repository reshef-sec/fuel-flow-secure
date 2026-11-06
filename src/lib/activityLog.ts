import { api } from "@/lib/apiClient";

const roleHe: Record<string, string> = { admin: "אדמין מרכזי", branch: "מנהל סניף", supervisor: "מפקח", viewer: "צופה" };

export interface Actor {
  name: string;
  role: string;
}

/** Fire-and-forget insert into activity_log. Never blocks or breaks the UI. The server stamps user_id and the IP address. */
export function logActivity(actor: Actor, action: string, target?: string | null) {
  void (async () => {
    try {
      const { error } = await api.from("activity_log").insert({
        user_name: actor.name || "—",
        role: roleHe[actor.role] ?? actor.role,
        action,
        target: target || "-",
      });
      if (error) console.warn("activity_log insert failed:", error.message);
    } catch (e) {
      console.warn("activity_log insert failed:", e);
    }
  })();
}
