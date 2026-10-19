import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCentralInventorySummary, type CentralInventorySummary } from "./centralInventorySummary";

export function useCentralInventorySummary(active = true) {
  const [summary, setSummary] = useState<CentralInventorySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await fetchCentralInventorySummary();
      if (id === requestId.current) {
        setSummary(result);
        setError(null);
      }
      return result;
    } catch (error) {
      if (id === requestId.current) {
        setSummary(null);
        setError(error instanceof Error ? error.message : "טעינת המלאי נכשלה");
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    setSummary(null);
    setError(null);
    const reload = () => { void refresh().catch(() => {}); };
    reload();
    const interval = window.setInterval(reload, 15000);
    window.addEventListener("focus", reload);
    window.addEventListener("central-inventory-changed", reload);
    return () => {
      requestId.current++;
      window.clearInterval(interval);
      window.removeEventListener("focus", reload);
      window.removeEventListener("central-inventory-changed", reload);
    };
  }, [active, refresh]);
  return { summary, error, refresh };
}