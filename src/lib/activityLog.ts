import { supabase } from "@/lib/supabaseClient";

const roleHe: Record<string, string> = { admin: "אדמין מרכזי", branch: "מנהל סניף", supervisor: "מפקח" };

export interface Actor {
  name: string;
  role: string;
}

/** Fire-and-forget insert into activity_log. Never blocks or breaks the UI. */
export function logActivity(actor: Actor, action: string, target?: string | null) {
  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const { error } = await supabase.from("activity_log").insert({
        user_id: data.user?.id ?? null,
        user_name: actor.name || "—",
        role: roleHe[actor.role] ?? actor.role,
        action,
        target: target || "-",
        ip_address: "-",
      });
      if (error) console.warn("activity_log insert failed:", error.message);
    } catch (e) {
      console.warn("activity_log insert failed:", e);
    }
  })();
}
