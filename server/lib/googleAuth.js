/**
 * Sign in with Google (Gmail and Google Workspace accounts): OAuth 2.0 authorization code flow with
 * PKCE, plus OpenID Connect state and nonce. Off until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
 * are set. Only an address Google reports as verified is accepted.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { pkceChallenge } from "./oauth.js";

const SCOPE = "openid email profile";
const clientId = () => process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET ?? "";

/** Network calls, replaceable in tests. */
export const transport = {
  keys: createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")),
  async exchangeCode({ code, redirect, verifier }) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId(), client_secret: clientSecret(), grant_type: "authorization_code",
        code, redirect_uri: redirect, code_verifier: verifier,
      }),
    });
    if (!res.ok) throw new Error(`token endpoint ${res.status}`);
    return res.json();
  },
};

export const google = {
  name: "google",
  /** Profile field that pins an account to this provider's identity. */
  subjectField: "google_sub",
  configured: () => Boolean(clientId() && clientSecret()),
  authorizeUrl(attempt, redirect) {
    const q = new URLSearchParams({
      client_id: clientId(),
      response_type: "code",
      redirect_uri: redirect,
      scope: SCOPE,
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge: pkceChallenge(attempt.verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  exchangeCode: (args) => transport.exchangeCode(args),
  /** Signature, audience, expiry, issuer and nonce. Throws when any of them is wrong. */
  async verifyIdToken(idToken, nonce) {
    const { payload } = await jwtVerify(idToken, transport.keys, {
      audience: clientId(),
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      algorithms: ["RS256"],
    });
    if (payload.nonce !== nonce) throw new Error("nonce mismatch");
    return payload;
  },
  /** The verified identity in a token, or null when Google has not verified the address. */
  identityFrom(claims) {
    const email = String(claims.email ?? "").trim().toLowerCase();
    if (!email.includes("@") || claims.email_verified !== true) return null;
    return { email, subject: String(claims.sub) };
  },
};
