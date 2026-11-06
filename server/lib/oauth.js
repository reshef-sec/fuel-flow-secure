/** Shared by the sign-in providers (Microsoft, Google): one-time values and the callback address. */
import { createHash, randomBytes } from "node:crypto";

const b64 = (n) => randomBytes(n).toString("base64url");

/** One-time values for a sign-in attempt, kept in a signed cookie until the provider redirects back. */
export const newAttempt = () => ({ state: b64(24), nonce: b64(24), verifier: b64(48) });

export const pkceChallenge = (verifier) => createHash("sha256").update(verifier).digest("base64url");

/** The callback address registered with the provider; RENDER_EXTERNAL_URL is set by Render. */
export function redirectUri(req, provider) {
  const override = process.env[`${provider.toUpperCase()}_REDIRECT_URI`];
  if (override) return override;
  const base = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`;
  return `${base.replace(/\/$/, "")}/api/auth/${provider}/callback`;
}
