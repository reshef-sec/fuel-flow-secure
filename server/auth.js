/**
 * JWT + bcrypt session handling (replaces Supabase Auth).
 * The token lives in an httpOnly, SameSite=Strict cookie; it is never readable by page scripts.
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Profile } from "./models.js";
import { forbidden, unauthorized } from "./errors.js";

export const COOKIE = "rsf_session";
const TTL_SECONDS = 12 * 60 * 60;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set (at least 32 characters)");
  return s;
}

export const hashPassword = (pw) => bcrypt.hash(String(pw), 12);
export const verifyPassword = (pw, hash) => bcrypt.compare(String(pw), String(hash || ""));

export function issueSession(res, profile) {
  const token = jwt.sign({ sub: profile.id, tv: profile.token_version ?? 0 }, secret(), {
    expiresIn: TTL_SECONDS, algorithm: "HS256",
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

/** Normalizes an Israeli mobile number to digits only (mirror of src/lib/phoneLogin.ts). */
export function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("972")) digits = `0${digits.slice(3)}`;
  return digits;
}

/** Password policy for the mandatory first-login change. Returns an error message or null. */
export function passwordPolicyError(pw, profile) {
  const p = String(pw ?? "");
  if (p.length < 8) return "הסיסמה חייבת להכיל לפחות 8 תווים";
  if (!/[A-Za-zא-ת]/.test(p) || !/\d/.test(p)) return "הסיסמה חייבת להכיל אותיות וספרות";
  if (profile && (p === profile.national_id || p === profile.phone)) return "אין להשתמש בת.ז או במספר הנייד כסיסמה";
  return null;
}

/** Attaches req.user (the Profile document) when a valid session cookie is present. */
export async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, secret(), { algorithms: ["HS256"] });
    const profile = await Profile.findOne({ id: payload.sub });
    if (profile && (profile.token_version ?? 0) === payload.tv) req.user = profile;
  } catch {
    /* invalid / expired token → anonymous */
  }
  next();
}

/** Signed in AND past the mandatory first-login password change. */
export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.requires_password_change) return next(forbidden("יש לעדכן סיסמה לפני הכניסה למערכת"));
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.requires_password_change) return next(forbidden("יש לעדכן סיסמה לפני הכניסה למערכת"));
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

/** Development tools (demo data / reset) are pinned to one immutable owner identity: מאיה קורן. */
export function isDevToolsOwner(user) {
  if (!user || user.role !== "admin" || user.requires_password_change) return false;
  const ownerId = String(process.env.DEV_TOOLS_OWNER_NATIONAL_ID ?? "").trim();
  const ownerPhone = normalizePhone(process.env.DEV_TOOLS_OWNER_PHONE ?? "");
  if (!ownerId && !ownerPhone) return false; // fail closed when not configured
  if (ownerId && user.national_id !== ownerId) return false;
  if (ownerPhone && user.phone !== ownerPhone) return false;
  return true;
}

export const publicProfile = (p) => p && ({
  id: p.id,
  phone: p.phone,
  national_id: p.national_id,
  full_name: p.full_name,
  branch: p.branch,
  role: p.role,
  requires_password_change: Boolean(p.requires_password_change),
  is_first_login: Boolean(p.requires_password_change),
  /** סביבת לימוד active — only ever true for the dev-tools owner. */
  learning_mode: Boolean(p.learning_mode) && isDevToolsOwner(p),
});
