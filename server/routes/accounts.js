/**
 * Login accounts, managed from Settings → Users. Actions: bootstrap | sync | reset | delete |
 * change_password. Users are identified by their stable `id`; email is how they sign in.
 * A new user needs no password: their first Microsoft or Google sign-in creates the login account.
 */
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { AppUser, Profile, REAL, ROLES } from "../models.js";
import { ah, badRequest, forbidden, unauthorized } from "../errors.js";
import { hashPassword, normalizeEmail, normalizePhone, passwordPolicyError, issueSession, verifyPassword } from "../auth.js";
import { logAction } from "../lib/audit.js";
import { claimHeldCards } from "../lib/claimHeldCards.js";

const router = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireAdmin(req) {
  if (!req.user) throw unauthorized();
  if (req.user.requires_password_change) throw forbidden("יש לעדכן סיסמה לפני הכניסה למערכת");
  if (req.user.role !== "admin") throw forbidden();
}

function input(body) {
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  if (email && !EMAIL.test(email)) throw badRequest("כתובת אימייל לא תקינה");
  if (phone && !/^05\d{8}$/.test(phone)) throw badRequest("מספר נייד לא תקין");
  return {
    id: String(body.id ?? "").trim(),
    email: email || null,
    phone,
    role: ROLES.includes(body.role) ? body.role : "supervisor",
    fullName: String(body.fullName ?? "").trim(),
    branch: String(body.branch ?? "").trim(),
  };
}

/** A first password an admin can hand over; it must be changed at first use. */
const temporaryPassword = () => `${randomBytes(6).toString("base64url")}a1`;

async function assertFree(field, value, id) {
  if (value && await Profile.exists({ [field]: value, id: { $ne: id } })) {
    throw badRequest(field === "email" ? "האימייל כבר משויך למשתמש אחר" : "מספר הנייד כבר משויך למשתמש אחר");
  }
}

router.post("/", ah(async (req, res) => {
  const { action, ...body } = req.body ?? {};

  switch (action) {
    case "bootstrap": {
      // Only while no admin exists (first-time installation).
      if (await Profile.exists({ role: "admin" })) throw forbidden("המערכת כבר הוגדרה");
      const d = input({ ...body, role: "admin" });
      if (!d.email) throw badRequest("יש להזין כתובת אימייל");
      const err = passwordPolicyError(body.password, { email: d.email, phone: d.phone });
      if (err) throw badRequest(err);
      const [first, ...rest] = d.fullName.split(" ");
      const user = await AppUser.create({
        email: d.email, phone: d.phone, role: "admin", first_name: first ?? "", last_name: rest.join(" "),
        branch: "", requires_password_change: false,
      });
      await Profile.create({
        id: user.id, email: d.email, phone: d.phone, full_name: d.fullName, branch: "", role: "admin",
        password_hash: await hashPassword(body.password), requires_password_change: false,
      });
      return res.json({ ok: true });
    }
    case "sync": {
      requireAdmin(req);
      const d = input(body);
      if (!d.id) throw badRequest("משתמש לא מזוהה");
      const existing = await Profile.findOne({ id: d.id });
      if (existing) {
        await assertFree("email", d.email, d.id);
        await assertFree("phone", d.phone, d.id);
        const roleChanged = existing.role !== d.role || existing.branch !== d.branch;
        existing.set({ phone: d.phone, email: d.email, full_name: d.fullName || existing.full_name, branch: d.branch, role: d.role });
        // A new address may belong to a different Microsoft or Google account.
        if (existing.isModified("email")) existing.set({ microsoft_sub: null, google_sub: null });
        if (roleChanged) existing.token_version = (existing.token_version ?? 0) + 1;
        await existing.save();
      }
      logAction(req.user, "סנכרון חשבון משתמש", d.fullName || d.email || d.id);
      return res.json({ ok: true });
    }
    case "reset": {
      requireAdmin(req);
      const d = input(body);
      if (!d.id) throw badRequest("משתמש לא מזוהה");
      if (!d.email && !d.phone) throw badRequest("למשתמש אין אימייל או נייד לכניסה");
      const password = temporaryPassword();
      const hash = await hashPassword(password);
      const p = await Profile.findOne({ id: d.id });
      if (!p) {
        await assertFree("email", d.email, d.id);
        await assertFree("phone", d.phone, d.id);
        await claimHeldCards(await Profile.create({
          id: d.id, phone: d.phone, email: d.email, full_name: d.fullName, branch: d.branch, role: d.role,
          password_hash: hash, requires_password_change: true,
        }));
      } else {
        p.password_hash = hash;
        p.requires_password_change = true;
        p.token_version = (p.token_version ?? 0) + 1;
        p.failed_logins = 0;
        p.locked_until = null;
        await p.save();
      }
      await AppUser.updateOne({ id: d.id }, { $set: { requires_password_change: true } });
      logAction(req.user, "איפוס סיסמה", d.fullName || d.email || d.id);
      return res.json({ ok: true, temporaryPassword: password });
    }
    case "delete": {
      requireAdmin(req);
      const id = String(body.id ?? "").trim();
      if (id === req.user.id) throw badRequest("לא ניתן למחוק את החשבון המחובר");
      await Profile.deleteOne({ id });
      logAction(req.user, "מחיקת חשבון משתמש", id);
      return res.json({ ok: true });
    }
    case "change_password": {
      if (!req.user) throw unauthorized();
      const err = passwordPolicyError(body.password, req.user);
      if (err) throw badRequest(err);
      if (await verifyPassword(body.password, req.user.password_hash)) throw badRequest("יש לבחור סיסמה שונה מהסיסמה הנוכחית");
      req.user.password_hash = await hashPassword(body.password);
      req.user.requires_password_change = false;
      req.user.token_version = (req.user.token_version ?? 0) + 1;
      await req.user.save();
      // The signed-in identity is always real (req.user is a real profile), even inside סביבת לימוד.
      await REAL.AppUser.updateOne({ id: req.user.id }, { $set: { requires_password_change: false } });
      issueSession(res, req.user);
      return res.json({ ok: true });
    }
    default:
      throw badRequest("Unknown action");
  }
}));

export default router;
