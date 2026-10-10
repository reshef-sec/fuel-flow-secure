import { useEffect } from "react";
import { toast } from "sonner";

import { useAuthContext } from "@/lib/auth-context";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/store/appStore";

function browserNotify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted" && document.visibilityState !== "visible") {
    try {
      new Notification(title, { body, icon: "/favicon.png" });
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
}

function notify(title: string, body: string) {
  toast.info(title, { description: body, duration: 8000 });
  browserNotify(title, body);
}

/**
 * Live alerts based on the signed-in account (not the preview role):
 * admins hear about new voucher requests, supervisors about vouchers allocated to them.
 */
export function RealtimeNotifications() {
  const { profile } = useAuthContext();
  const role = profile?.role;
  const uid = profile?.id;

  useEffect(() => {
    if (!role || !uid) return;
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();

    const channel = supabase.channel(`notify-${uid}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = 0;

    if (role === "admin") {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "voucher_requests" },
        (payload) => {
          const r = payload.new as { requester?: string; branch?: string; amount?: number };
          notify("דרישת שוברים חדשה", `${r.requester ?? ""} · ${r.branch ?? ""} · ${Number(r.amount ?? 0).toLocaleString("he-IL")} ₪`);
          void useAppStore.getState().loadFromCloud();
        },
      );
    }

    if (role === "supervisor") {
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "vouchers", filter: `supervisor_id=eq.${uid}` },
        (payload) => {
          const before = payload.old as { supervisor_id?: string | null };
          // Only count vouchers newly assigned to me (old row may be partial without REPLICA IDENTITY FULL).
          if (before && "supervisor_id" in before && before.supervisor_id === uid) return;
          pending += Number((payload.new as { amount?: number }).amount ?? 100);
          clearTimeout(timer);
          timer = setTimeout(() => {
            notify("הוקצו לך שוברים חדשים", `סה"כ ${pending.toLocaleString("he-IL")} ₪ זמינים להפקה`);
            pending = 0;
            void useAppStore.getState().loadFromCloud();
          }, 1500);
        },
      );
    }

    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [role, uid]);

  return null;
}
