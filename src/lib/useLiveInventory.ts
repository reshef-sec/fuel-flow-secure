import { useEffect, useState } from "react";
import { loadIssuanceStock } from "@/lib/cloudSync";
import { useAppStore } from "@/store/appStore";

/** Refresh while inventory is visible, including after returning to the tab. */
export function useLiveInventory(active = true) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!active) return;
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const vouchers = await loadIssuanceStock();
        if (!cancelled) { useAppStore.setState({ vouchers }); setReady(true); }
      } catch { if (!cancelled) setReady(false); }
      finally { pending = false; }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 15 * 1000);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [active]);
  return ready;
}