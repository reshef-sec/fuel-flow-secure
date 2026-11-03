import { useEffect } from "react";
import { toast } from "sonner";

import { useAuthContext } from "@/lib/auth-context";
import { apiFetch } from "@/lib/apiClient";
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

interface NotificationsResponse {
  now: string;
  requests: { requester?: string; branch?: string; amount?: number }[];
  assigned: { count: number; total: number };
}

const POLL_MS = 20 * 1000;

/**
 * Live alerts based on the signed-in account (not the preview role):
 * admins hear about new voucher requests, supervisors about vouchers allocated to them.
 * Polls GET /api/notifications every 20s while the tab is visible (replaces Realtime channels).
 */
export function RealtimeNotifications() {
  const { profile } = useAuthContext();
  const role = profile?.role;
  const uid = profile?.id;

  useEffect(() => {
    if (!role || !uid) return;
    if (role !== "admin" && role !== "supervisor") return;
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();

    let cancelled = false;
    let inFlight = false;
    // Server clock cursor: only events after the moment this listener started count.
    let since: string | null = null;

    const poll = async () => {
      if (cancelled || inFlight) return;
      if (since && document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const query = since ? `?since=${encodeURIComponent(since)}` : "";
        const { body } = await apiFetch<NotificationsResponse>(`/api/notifications${query}`);
        if (cancelled || !body) return;
        const first = since === null;
        since = body.now;
        if (first) return;

        if (role === "admin" && body.requests.length) {
          for (const r of body.requests) {
            notify("דרישת שוברים חדשה", `${r.requester ?? ""} · ${r.branch ?? ""} · ${Number(r.amount ?? 0).toLocaleString("he-IL")} ₪`);
          }
          void useAppStore.getState().loadFromCloud();
        }

        if (role === "supervisor" && body.assigned.count > 0) {
          notify("הוקצו לך שוברים חדשים", `סה"כ ${Number(body.assigned.total).toLocaleString("he-IL")} ₪ זמינים להפקה`);
          void useAppStore.getState().loadFromCloud();
        }
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [role, uid]);

  return null;
}
