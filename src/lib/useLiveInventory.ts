import { useEffect, useState } from "react";
import { loadIssuanceStock } from "@/lib/cloudSync";
import { useAppStore } from "@/store/appStore";

const REFRESH_MS = 60 * 1000;

/**
 * Keeps the card list fresh while a stock screen is open. The first copy comes from the app's own
 * start-up load, so opening a screen downloads nothing; every action re-reads stock before it runs.
 */
export function useLiveInventory(active = true) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!active) return;
    let cancelled = false;
    let pending = false;
    let last = Date.now();
    const refresh = async () => {
      if (pending || document.hidden || Date.now() - last < REFRESH_MS) return;
      pending = true;
      last = Date.now();
      try {
        const vouchers = await loadIssuanceStock();
        if (!cancelled) useAppStore.setState({ vouchers });
      } catch { /* the next refresh retries */ }
      finally { pending = false; }
    };
    const markReady = () => { if (useAppStore.getState().stockLoaded) setReady(true); };
    markReady();
    const unsubscribe = useAppStore.subscribe(markReady);
    const interval = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; unsubscribe(); window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [active]);
  return ready;
}
