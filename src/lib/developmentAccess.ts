export function canUseDevelopmentTools(sessionUserId: string | undefined, verifiedUserId: string | null) {
  return Boolean(sessionUserId && verifiedUserId && sessionUserId === verifiedUserId);
}

export const RESET_CONFIRMATION = "איפוס וניקוי נתונים";
export function isResetConfirmed(value: string) {
  return value.trim() === RESET_CONFIRMATION;
}