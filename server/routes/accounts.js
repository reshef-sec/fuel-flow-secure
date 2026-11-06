/**
 * Port of the Supabase `admin-accounts` edge function. Same action names and
 * payloads as src/lib/backend.ts sends: bootstrap | activate | sync | reset | delete | change_password.
 */
import { Router } from "express";
import { AppUser, Profile, REAL } from "../models.js";
import { ah, badRequest, forbidden, unauthorized } from "../errors.js";
import { hashPassword, normalizePhone, passwordPolicyError, issueSession, verifyPassword } from "../auth.js";
import { logAction } from "../lib/audit.js";
import { claimHeldCards } from "../lib/claimHeldCards.js";
import { ROLES } from "../models.js";

const router = Router();
const ID = /^\d{9}$/;

function requireAdmin(req) {
  if (!req.user) throw unauthorized();
  if (req.user.requires_password_change) throw forbidden("יש לעדכן סיסמה לפני הכניסה למערכת");
  if (req.user.role !== "admin") throw forbidden();
}

function input(body) {
  const phone = normalizePhone(body.phone);
  const nationalId = String(body.nationalId ?? "").trim();
  const role = ROLES.includes(body.role) ? body.role : "supervisor";
  if (!/^05\d{8}$/.test(phone)) throw badRequest("מספר נייד לא תקין");
  if (!ID.test(nationalId)) throw badRequest("ת.ז חייבת להכיל 9 ספרות");
  return { phone, nationalId, role, fullName: String(body.fullName ?? "").trim(), branch: String(body.branch ?? "").trim() };
}

router.post("/", ah(async (req, res) => {
  const { action, ...body } = req.body ?? {};

  switch (action) {
    case "bootstrap": {
      // Only while no admin exists (first-time installation).
      if (await Profile.exists({ role: "admin" })) throw forbidden("המערכת כבר הוגדרה");
      const d = input({ ...body, role: "admin" });
      const [first, ...rest] = d.fullName.split(" ");
      await AppUser.updateOne({ national_id: d.nationalId }, {
        $set: { phone: d.phone, role: "admin", first_name: first ?? "", last_name: rest.join(" "), branch: "", requires_password_change: true },
      }, { upsert: true });
      await Profile.create({
        phone: d.phone, national_id: d.nationalId, full_name: d.fullName, branch: "", role: "admin",
        password_hash: await hashPassword(d.nationalId), requires_password_change: true,
      });
      return res.json({ ok: true });
    }
    case "activate":
      // Activation now happens inside POST /api/auth/login; kept for API compatibility.
      return res.json({ ok: true });
    case "sync": {
      requireAdmin(req);
      const d = input(body);
      const existing = await Profile.findOne({ national_id: d.nationalId });
      const clash = await Profile.findOne({ phone: d.phone, national_id: { $ne: d.nationalId } });
      if (clash) throw badRequest("מספר הנייד כבר משויך למשתמש אחר");
      if (existing) {
        const roleChanged = existing.role !== d.role || existing.branch !== d.branch;
        existing.set({ phone: d.phone, full_name: d.fullName || existing.full_name, branch: d.branch, role: d.role });
        if (roleChanged) existing.token_version = (existing.token_version ?? 0) + 1;
        await existing.save();
      } else {
        await claimHeldCards(await Profile.create({
          phone: d.phone, national_id: d.nationalId, full_name: d.fullName, branch: d.branch, role: d.role,
          password_hash: await hashPassword(d.nationalId), requires_password_change: true,
        }));
      }
      logAction(req.user, "סנכרון חשבון משתמש", d.nationalId);
      return res.json({ ok: true });
    }
    case "reset": {
      requireAdmin(req);
      const d = input(body);
      const p = await Profile.findOne({ national_id: d.nationalId });
      if (!p) {
        await claimHeldCards(await Profile.create({
          phone: d.phone, national_id: d.nationalId, full_name: d.fullName, branch: d.branch, role: d.role,
          password_hash: await hashPassword(d.nationalId), requires_password_change: true,
        }));
      } else {
        p.password_hash = await hashPassword(d.nationalId);
        p.requires_password_change = true;
        p.token_version = (p.token_version ?? 0) + 1;
        p.failed_logins = 0;
        p.locked_until = null;
        await p.save();
      }
      await AppUser.updateOne({ national_id: d.nationalId }, { $set: { requires_password_change: true } });
      logAction(req.user, "איפוס סיסמה", d.nationalId);
      return res.json({ ok: true });
    }
    case "delete": {
      requireAdmin(req);
      const nationalId = String(body.nationalId ?? "").trim();
      if (nationalId === req.user.national_id) throw badRequest("לא ניתן למחוק את החשבון המחובר");
      await Profile.deleteOne({ national_id: nationalId });
      logAction(req.user, "מחיקת חשבון משתמש", nationalId);
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
      await REAL.AppUser.updateOne({ national_id: req.user.national_id }, { $set: { requires_password_change: false } });
      issueSession(res, req.user);
      return res.json({ ok: true });
    }
    default:
      throw badRequest("Unknown action");
  }
}));

export default router;
