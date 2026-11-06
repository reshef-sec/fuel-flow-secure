import { Router } from "express";
import { AppUser, Profile } from "../models.js";
import { ah, badRequest, unauthorized, HttpError } from "../errors.js";
import {
  clearSession, hashPassword, issueSession, normalizePhone, passwordPolicyError, publicProfile, verifyPassword,
} from "../auth.js";
import { logAction } from "../lib/audit.js";
import { claimHeldCards } from "../lib/claimHeldCards.js";

const router = Router();
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const INVALID = "מספר נייד או סיסמה שגויים";

const fullNameOf = (u) => `${u.first_name ?? ""} ${u.last_name ?? ""}`.replace(/\s+/g, " ").trim();

/**
 * Login with phone + password. A staff member listed in Settings → Users but with no
 * login yet is activated on first sign-in with their ת.ז as the initial password and
 * is then forced through /change-password (requires_password_change = is_first_login).
 */
router.post("/login", ah(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password ?? "");
  if (!phone || !password) throw badRequest("יש למלא מספר נייד וסיסמה");

  let profile = await Profile.findOne({ phone });
  if (!profile && /^\d{9}$/.test(password)) {
    const staff = await AppUser.findOne({ national_id: password });
    if (staff && normalizePhone(staff.phone) === phone) {
      profile = await Profile.create({
        phone, national_id: staff.national_id, full_name: fullNameOf(staff), branch: staff.branch ?? "",
        role: staff.role, password_hash: await hashPassword(password), requires_password_change: true,
      });
      await claimHeldCards(profile);
    }
  }
  if (!profile) throw unauthorized(INVALID);
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
  profile.failed_logins = 0;
  profile.locked_until = null;
  profile.last_login_at = new Date();
  await profile.save();
  issueSession(res, profile);
  logAction(profile, "כניסה למערכת", phone);
  res.json({ profile: publicProfile(profile) });
}));

router.post("/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get("/me", ah(async (req, res) => {
  if (!req.user) return res.json({ profile: null });
  // Display name prefers the live staff directory entry.
  const staff = await AppUser.findOne({ national_id: req.user.national_id }).lean();
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
  await AppUser.updateOne({ national_id: req.user.national_id }, { $set: { requires_password_change: false } });
  issueSession(res, req.user);
  logAction(req.user, "עדכון סיסמה", req.user.phone);
  res.json({ ok: true, profile: publicProfile(req.user) });
}));

export default router;
