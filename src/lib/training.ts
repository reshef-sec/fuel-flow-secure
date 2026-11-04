/**
 * סרטוני הדרכה — client for server/routes/training.js. Owner-only management; public viewing links
 * (/training/<token>) play the video and nothing else.
 */
import { apiFetch } from "./apiClient";

export type TrainingVideoId = "admin" | "intro";
export interface TrainingVideo { id: TrainingVideoId; title: string; available: boolean }
export interface TrainingShare { token: string; video: TrainingVideoId; created_at: string; views: number; last_viewed_at: string | null }

export async function getTraining(): Promise<{ videos: TrainingVideo[]; shares: TrainingShare[] }> {
  const { body, error } = await apiFetch<{ videos: TrainingVideo[]; shares: TrainingShare[] }>("/api/training");
  if (error || !body) throw new Error(error?.message || "טעינת הסרטונים נכשלה");
  return body;
}
export async function createTrainingShare(video: TrainingVideoId): Promise<string> {
  const { body, error } = await apiFetch<{ token: string }>("/api/training/shares", { body: { video } });
  if (error || !body) throw new Error(error?.message || "יצירת הקישור נכשלה");
  return body.token;
}
export async function revokeTrainingShare(token: string): Promise<void> {
  const { error } = await apiFetch(`/api/training/shares/${encodeURIComponent(token)}`, { method: "DELETE", body: {} });
  if (error) throw new Error(error.message || "ביטול הקישור נכשל");
}
export async function getPublicTraining(token: string): Promise<{ title: string; video: TrainingVideoId } | null> {
  const { body, error } = await apiFetch<{ title: string; video: TrainingVideoId }>(`/api/training/public/${encodeURIComponent(token)}`);
  return error || !body ? null : body;
}
export const trainingShareUrl = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/training/${token}`;
