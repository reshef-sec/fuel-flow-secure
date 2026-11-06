/**
 * Sign in with Microsoft (work, school and personal Outlook accounts): OAuth 2.0 authorization code
 * flow with PKCE, plus OpenID Connect state and nonce. Off until MICROSOFT_CLIENT_ID and
 * MICROSOFT_CLIENT_SECRET are set.
 *
 * Matching a Microsoft login to a user by email is only safe when the email is trustworthy: an
 * organisation can put any address in its own users' profiles. So an address is accepted only from
 *   - a personal Microsoft account (Microsoft verified it),
 *   - the single tenant named in MICROSOFT_TENANT_ID (your own organisation), or
 *   - a token with the xms_edov optional claim (the domain owner verified it).
 * Each user is also pinned to their Microsoft identity on first sign-in.
 */
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const CONSUMERS_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
const AUTHORITY = "https://login.microsoftonline.com";
const SCOPE = "openid profile email";
const CALLBACK = "/api/auth/microsoft/callback";

const clientId = () => process.env.MICROSOFT_CLIENT_ID ?? "";
const clientSecret = () => process.env.MICROSOFT_CLIENT_SECRET ?? "";
const tenant = () => process.env.MICROSOFT_TENANT_ID || "common";

export const microsoftConfigured = () => Boolean(clientId() && clientSecret());

/** The callback address registered in Azure; RENDER_EXTERNAL_URL is set by Render. */
export function redirectUri(req) {
  if (process.env.MICROSOFT_REDIRECT_URI) return process.env.MICROSOFT_REDIRECT_URI;
  const base = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`;
  return base.replace(/\/$/, "") + CALLBACK;
}

const b64 = (n) => randomBytes(n).toString("base64url");

/** One-time values for a sign-in attempt, kept in a signed cookie until Microsoft redirects back. */
export const newAttempt = () => ({ state: b64(24), nonce: b64(24), verifier: b64(48) });

export function authorizeUrl(attempt, redirect) {
  const q = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: redirect,
    response_mode: "query",
    scope: SCOPE,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: createHash("sha256").update(attempt.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTHORITY}/${tenant()}/oauth2/v2.0/authorize?${q}`;
}

/** Network calls, replaceable in tests. */
export const transport = {
  keys: createRemoteJWKSet(new URL(`${AUTHORITY}/common/discovery/v2.0/keys`)),
  async exchangeCode({ code, redirect, verifier }) {
    const res = await fetch(`${AUTHORITY}/${tenant()}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId(), client_secret: clientSecret(), grant_type: "authorization_code",
        code, redirect_uri: redirect, code_verifier: verifier, scope: SCOPE,
      }),
    });
    if (!res.ok) throw new Error(`token endpoint ${res.status}`);
    return res.json();
  },
};

/** Signature, audience, expiry, issuer and nonce. Throws when any of them is wrong. */
export async function verifyIdToken(idToken, nonce) {
  const { payload } = await jwtVerify(idToken, transport.keys, { audience: clientId(), algorithms: ["RS256"] });
  if (!payload.tid || payload.iss !== `${AUTHORITY}/${payload.tid}/v2.0`) throw new Error("issuer mismatch");
  if (payload.nonce !== nonce) throw new Error("nonce mismatch");
  return payload;
}

/** The verified identity in a token, or null when its email can't be trusted. */
export function identityFrom(claims) {
  const email = String(claims.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  const configured = tenant();
  const trusted = claims.tid === CONSUMERS_TENANT
    || (!["common", "organizations", "consumers"].includes(configured) && claims.tid === configured)
    || claims.xms_edov === true || claims.xms_edov === "1" || claims.xms_edov === 1;
  if (!trusted) return null;
  return { email, subject: `${claims.tid}:${claims.oid ?? claims.sub}` };
}
