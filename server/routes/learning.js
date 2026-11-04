/**
 * סביבת לימוד (learning environment) — owner-only (מאיה קורן, see isDevToolsOwner).
 *
 *   GET  /api/learning                      → { active, seeded, counts }
 *   POST /api/learning { action: "activate" }  seed if empty, then route the owner's requests to learning_* collections
 *   POST /api/learning { action: "pause" }     back to real data; learning data is kept for next time
 *   POST /api/learning { action: "reset" }     wipe and re-seed the learning data (stays in the current mode)
 *
 * Isolation: while active, the owner's API requests run inside learningContext, so every model
 * resolves to its learning_* twin. Real data is never read or written in that context, and other
 * users never enter it.
 */
import { Router } from "express";
import { ah, badRequest, forbidden, unauthorized } from "../errors.js";
import { isDevToolsOwner } from "../auth.js";
import { LEARNING } from "../models.js";
import { runInLearning } from "../lib/learningContext.js";
import { seedLearning } from "../lib/learningSeed.js";
import { logAction } from "../lib/audit.js";

const router = Router();

function owner(req) {
  if (!req.user) throw unauthorized();
  if (!isDevToolsOwner(req.user)) throw forbidden("סביבת הלימוד זמינה למנהלת המערכת בלבד");
  return req.user;
}

async function counts() {
  const [vouchers, links, requests, users] = await Promise.all([
    LEARNING.Voucher.countDocuments(), LEARNING.WorkerLink.countDocuments(),
    LEARNING.VoucherRequest.countDocuments(), LEARNING.AppUser.countDocuments(),
  ]);
  return { vouchers, links, requests, users };
}

async function wipe() {
  await Promise.all(Object.values(LEARNING).map((m) => m.deleteMany({})));
}

async function ensureSeeded(user) {
  if (await LEARNING.Voucher.countDocuments()) return false;
  await wipe();
  await runInLearning(() => seedLearning({ owner: user }));
  return true;
}

router.get("/", ah(async (req, res) => {
  const user = owner(req);
  const c = await counts();
  res.json({ active: Boolean(user.learning_mode), seeded: c.vouchers > 0, counts: c });
}));

router.post("/", ah(async (req, res) => {
  const user = owner(req);
  const action = String(req.body?.action ?? "");
  if (action === "activate") {
    const seeded = await ensureSeeded(user);
    user.learning_mode = true;
    await user.save();
    logAction(user, "הפעלת סביבת לימוד", seeded ? "נטענו נתוני דמו" : "-");
  } else if (action === "pause") {
    user.learning_mode = false;
    await user.save();
    logAction(user, "השהיית סביבת לימוד", "-");
  } else if (action === "reset") {
    await wipe();
    await runInLearning(() => seedLearning({ owner: user }));
    logAction(user, "איפוס סביבת לימוד", "נטענו נתוני דמו מחדש");
  } else {
    throw badRequest("פעולה לא מוכרת");
  }
  res.json({ ok: true, active: Boolean(user.learning_mode), seeded: true, counts: await counts() });
}));

/**
 * Express middleware: route the owner's requests into the learning collections while active.
 * /api/auth and /api/learning always use the real data (login state lives there).
 */
export function learningRouter(req, _res, next) {
  if (req.path.startsWith("/auth") || req.path.startsWith("/learning")) return next();
  if (req.user?.learning_mode && isDevToolsOwner(req.user)) return runInLearning(next);
  next();
}

export default router;
