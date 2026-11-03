/**
 * Client-side mirror of the server password policy (server/auth.js passwordPolicyError).
 * The server re-checks every change and also rejects reusing the current password.
 */
export function passwordPolicyError(pw: string, profile?: { national_id?: string; phone?: string } | null): string | null {
  const p = String(pw ?? "");
  if (p.length < 8) return "הסיסמה חייבת להכיל לפחות 8 תווים";
  if (!/[A-Za-zא-ת]/.test(p) || !/\d/.test(p)) return "הסיסמה חייבת להכיל אותיות וספרות";
  if (profile && (p === profile.national_id || p === profile.phone)) return "אין להשתמש בת.ז או במספר הנייד כסיסמה";
  return null;
}
