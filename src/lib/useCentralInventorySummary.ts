import { useEffect } from "react";
import { create } from "zustand";
import { fetchCentralInventorySummary, type CentralInventorySummary } from "./centralInventorySummary";

const useSummary = create<{
  summary: CentralInventorySummary | null;
  error: string | null;
}>()(() => ({ summary: null, error: null }));

export async function refreshCentralInventorySummary() {
  try {
    const summary = await fetchCentralInventorySummary();
    useSummary.setState({ summary, error: null });
    return summary;
  } catch (error) {
    useSummary.setState({ summary: null, error: error instanceof Error ? error.message : "טעינת המלאי נכשלה" });
    throw error;
  }
}

export function useCentralInventorySummary(active = true) {
  const state = useSummary();
  useEffect(() => {
    if (!active) return;
    const refresh = () => { void refreshCentralInventorySummary().catch(() => {}); };
    refresh();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("central-inventory-changed", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("central-inventory-changed", refresh);
    };
  }, [active]);
  return state;
}