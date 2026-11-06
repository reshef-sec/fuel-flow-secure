import { Router } from "express";
import jwt from "jsonwebtoken";
import { AppUser, Profile } from "../models.js";
import { ah, badRequest, forbidden, unauthorized, HttpError } from "../errors.js";
import {
  clearSession, hashPassword, isDevToolsOwner, issueSession, normalizeEmail, normalizePhone, passwordPolicyError, publicProfile, verifyPassword,
} from "../auth.js";
import { logAction } from "../lib/audit.js";
import { claimHeldCards } from "../lib/claimHeldCards.js";
import { microsoft } from "../lib/microsoftAuth.js";
import { google } from "../lib/googleAuth.js";
import { newAttempt, redirectUri } from "../lib/oauth.js";

const router = Router();
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const INVALID = "פרטי הכניסה שגויים";
const ATTEMPT_COOKIE = "rsf_oauth";
const ATTEMPT_PATH = "/api/auth";
const PROVIDERS = { microsoft, google };
const USE_PROVIDER = "הכניסה למערכת מתבצעת דרך Google או Microsoft";
const singleSignOnOnly = () => microsoft.configured() || google.configured();

const fullNameOf = (u) => `${u.first_name ?? ""} ${u.last_name ?? ""}`.replace(/\s+/g, " ").trim();

/** What the login screen may offer. */
router.get("/options", (_req, res) => res.json({ microsoft: microsoft.configured(), google: google.configured() }));

/**
 * Password sign-in. Once Google or Microsoft is set up they are the way in, and a password works
 * only for the primary admin (by email). Until then it stays open, also by mobile number, so
 * nobody is locked out before the providers exist.
 */
router.post("/login", ah(async (req, res) => {
  const identifier = String(req.body?.identifier ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!identifier || !password) throw badRequest("יש למלא אימייל וסיסמה");

  const profile = await Profile.findOne(identifier.includes("@")
    ? { email: normalizeEmail(identifier) }
    : { phone: normalizePhone(identifier) });
  if (!profile || !profile.password_hash) throw unauthorized(INVALID);
  if (profile.locked_until && profile.locked_until > new Date()) {
    throw new HttpError(429, "החשבון ננעל זמנית עקב ניסיונות כושלים. נסו שוב בעוד 15 דקות", "locked");
  }
  const ok = await verifyPassword(password, profile.password_hash);
  if (!ok) {
    profile.failed_logins = (profile.failed_logins ?? 0) + 1;
    if (profile.failed_logins >= MAX_FAILED) {
      profile.failed_logins = 0;
      profile.locked_until = new Date(Date.now() + LOCK_MS);
    }
    await profile.save();
    throw unauthorized(INVALID);
  }
  if (singleSignOnOnly() && !(isDevToolsOwner(profile) && identifier.includes("@"))) throw forbidden(USE_PROVIDER);
  profile.failed_logins = 0;
  profile.locked_until = null;
  profile.last_login_at = new Date();
  await profile.save();
  issueSession(res, profile);
  logAction(profile, "כניסה למערכת", profile.email || profile.phone);
  res.json({ profile: publicProfile(profile) });
}));

/** Step 1: send the browser to the provider, remembering this attempt in a signed, short-lived cookie. */
router.get("/:provider/start", (req, res, next) => {
  const provider = PROVIDERS[req.params.provider];
  if (!provider) return next();
  if (!provider.configured()) return res.redirect(302, "/login");
  const attempt = newAttempt();
  res.cookie(ATTEMPT_COOKIE, jwt.sign({ ...attempt, provider: provider.name }, process.env.JWT_SECRET, { expiresIn: 600, algorithm: "HS256" }), {
    // Lax, not Strict: it has to arrive with the redirect back from the provider.
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600_000, path: ATTEMPT_PATH,
  });
  res.redirect(302, provider.authorizeUrl(attempt, redirectUri(req, provider.name)));
});

/** Step 2: the provider sends the browser back. Only a verified, known address gets a session. */
router.get("/:provider/callback", ah(async (req, res, next) => {
  const provider = PROVIDERS[req.params.provider];
  if (!provider) return next();
  const fail = (reason) => res.redirect(302, `/login?error=${reason}`);
  const cookie = req.cookies?.[ATTEMPT_COOKIE];
  res.clearCookie(ATTEMPT_COOKIE, { path: ATTEMPT_PATH });
  if (!provider.configured() || !cookie || req.query.error) return fail("signin_failed");

  let identity = null;
  try {
    const attempt = jwt.verify(cookie, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (attempt.provider !== provider.name || typeof req.query.state !== "string"
      || req.query.state !== attempt.state || typeof req.query.code !== "string") {
      return fail("signin_failed");
    }
    const tokens = await provider.exchangeCode({ code: req.query.code, redirect: redirectUri(req, provider.name), verifier: attempt.verifier });
    identity = provider.identityFrom(await provider.verifyIdToken(tokens.id_token, attempt.nonce));
  } catch (e) {
    console.warn(`${provider.name} sign-in failed:`, e.message);
    return fail("signin_failed");
  }
  if (!identity) return fail("not_authorized");

  const staff = await AppUser.findOne({ email: identity.email });
  if (!staff) {
    logAction(null, "ניסיון כניסה נדחה", identity.email);
    return fail("not_authorized");
  }
  let profile = await Profile.findOne({ id: staff.id });
  const pinned = profile?.[provider.subjectField];
  if (pinned && pinned !== identity.subject) {
    logAction(profile, "ניסיון כניסה נדחה", identity.email);
    return fail("not_authorized");
  }
  if (!profile) {
    profile = await Profile.create({
      id: staff.id, email: identity.email, phone: normalizePhone(staff.phone), full_name: fullNameOf(staff),
      branch: staff.branch ?? "", role: staff.role, requires_password_change: false,
    });
    await claimHeldCards(profile);
  }
  profile.email = identity.email;
  profile[provider.subjectField] = identity.subject;
  profile.requires_password_change = false;
  profile.last_login_at = new Date();
  await profile.save();
  issueSession(res, profile);
  logAction(profile, `כניסה למערכת (${provider.name === "google" ? "Google" : "Microsoft"})`, identity.email);
  res.redirect(302, "/");
}));

router.post("/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get("/me", ah(async (req, res) => {
  if (!req.user) return res.json({ profile: null });
  // Display name prefers the live staff directory entry.
  const staff = await AppUser.findOne({ id: req.user.id }).lean();
  const p = publicProfile(req.user);
  if (staff) p.full_name = fullNameOf(staff) || p.full_name;
  res.json({ profile: p });
}));

/** Mandatory first-login change (also usable later). Invalidates every other session. */
router.post("/change-password", ah(async (req, res) => {
  if (!req.user) throw unauthorized();
  const password = String(req.body?.password ?? "");
  const err = passwordPolicyError(password, req.user);
  if (err) throw badRequest(err);
  if (await verifyPassword(password, req.user.password_hash)) throw badRequest("יש לבחור סיסמה שונה מהסיסמה הנוכחית");
  req.user.password_hash = await hashPassword(password);
  req.user.requires_password_change = false;
  req.user.token_version = (req.user.token_version ?? 0) + 1;
  await req.user.save();
  await AppUser.updateOne({ id: req.user.id }, { $set: { requires_password_change: false } });
  issueSession(res, req.user);
  logAction(req.user, "עדכון סיסמה", req.user.phone);
  res.json({ ok: true, profile: publicProfile(req.user) });
}));

export default router;
