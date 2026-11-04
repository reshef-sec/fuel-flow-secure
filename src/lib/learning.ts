/**
 * סביבת לימוד (learning environment) — owner-only client for server/routes/learning.js.
 * While active, the server serves every request of the owner from the demo copy, so no other
 * query changes; the UI only needs to toggle the mode and reload.
 */
import { apiFetch } from "./apiClient";

export interface LearningCounts { vouchers: number; links: number; requests: number; users: number }
export interface LearningStatus { active: boolean; seeded: boolean; counts: LearningCounts }
export type LearningAction = "activate" | "pause" | "reset";

const EMPTY_COUNTS: LearningCounts = { vouchers: 0, links: 0, requests: 0, users: 0 };

function normalize(body: Partial<LearningStatus> | null): LearningStatus {
  const c = (body?.counts ?? {}) as Partial<LearningCounts>;
  return {
    active: body?.active === true,
    seeded: body?.seeded === true,
    counts: {
      vouchers: Number(c.vouchers ?? EMPTY_COUNTS.vouchers),
      links: Number(c.links ?? EMPTY_COUNTS.links),
      requests: Number(c.requests ?? EMPTY_COUNTS.requests),
      users: Number(c.users ?? EMPTY_COUNTS.users),
    },
  };
}

/** GET /api/learning. Throws with the server's Hebrew message (403 for anyone but the owner). */
export async function getLearningStatus(): Promise<LearningStatus> {
  const { body, error } = await apiFetch<LearningStatus>("/api/learning");
  if (error) throw new Error(error.message);
  return normalize(body);
}

/** POST /api/learning { action }. Activating the first time seeds the demo data (may take a few seconds). */
export async function setLearningMode(action: LearningAction): Promise<LearningStatus> {
  const { body, error } = await apiFetch<LearningStatus & { ok: boolean }>("/api/learning", { body: { action } });
  if (error) throw new Error(error.message || "הפעולה נכשלה");
  return normalize(body);
}

/** Full reload of the current page so every store and page refetches from the right data set. */
export function reloadForLearningMode() {
  if (typeof window !== "undefined") window.location.assign(window.location.pathname);
}

export const LEARNING_RESET_CONFIRMATION = "איפוס סביבת לימוד";
export const isLearningResetConfirmed = (value: string) => value.trim() === LEARNING_RESET_CONFIRMATION;
