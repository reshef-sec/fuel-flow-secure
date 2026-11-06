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
import { createRemoteJWKSet, jwtVerify } from "jose";
import { pkceChallenge } from "./oauth.js";

const CONSUMERS_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
const AUTHORITY = "https://login.microsoftonline.com";
const SCOPE = "openid profile email";

const clientId = () => process.env.MICROSOFT_CLIENT_ID ?? "";
const clientSecret = () => process.env.MICROSOFT_CLIENT_SECRET ?? "";
const tenant = () => process.env.MICROSOFT_TENANT_ID || "common";

function authorizeUrl(attempt, redirect) {
  const q = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: redirect,
    response_mode: "query",
    scope: SCOPE,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: pkceChallenge(attempt.verifier),
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
async function verifyIdToken(idToken, nonce) {
  const { payload } = await jwtVerify(idToken, transport.keys, { audience: clientId(), algorithms: ["RS256"] });
  if (!payload.tid || payload.iss !== `${AUTHORITY}/${payload.tid}/v2.0`) throw new Error("issuer mismatch");
  if (payload.nonce !== nonce) throw new Error("nonce mismatch");
  return payload;
}

/** The verified identity in a token, or null when its email can't be trusted. */
function identityFrom(claims) {
  const email = String(claims.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  const configured = tenant();
  const trusted = claims.tid === CONSUMERS_TENANT
    || (!["common", "organizations", "consumers"].includes(configured) && claims.tid === configured)
    || claims.xms_edov === true || claims.xms_edov === "1" || claims.xms_edov === 1;
  if (!trusted) return null;
  return { email, subject: `${claims.tid}:${claims.oid ?? claims.sub}` };
}

export const microsoft = {
  name: "microsoft",
  /** Profile field that pins an account to this provider's identity. */
  subjectField: "microsoft_sub",
  configured: () => Boolean(clientId() && clientSecret()),
  authorizeUrl,
  exchangeCode: (args) => transport.exchangeCode(args),
  verifyIdToken,
  identityFrom,
};
