/**
 * סרטוני הדרכה (training videos) — owner-only (מאיה קורן, see isDevToolsOwner), in the real and the
 * learning environment alike, plus revocable public viewing links that grant NO access to the system.
 *
 *   GET    /api/training                     owner: videos + active share links
 *   GET    /api/training/video/:id           owner: stream a video (Range supported)
 *   GET    /api/training/poster/:id          owner: poster image
 *   POST   /api/training/shares {video}      owner: create a viewing link
 *   DELETE /api/training/shares/:token       owner: revoke a viewing link
 *   GET    /api/training/public/:token       anyone with the link: { title, video }
 *   GET    /api/training/public/:token/video anyone with the link: the video stream only
 *   GET    /api/training/public/:token/poster
 *
 * Share links live in their own collection (never routed to סביבת לימוד), so a link keeps working
 * whichever environment it was created in. A token is 32 random bytes — not guessable.
 */
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { ah, badRequest, forbidden, unauthorized, HttpError } from "../errors.js";
import { isDevToolsOwner } from "../auth.js";
import { logAction } from "../lib/audit.js";

const MEDIA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../media/training");

export const VIDEOS = {
  admin: { title: "מדריך למנהל/ת המערכת — מקצה לקצה", file: "admin.mp4", poster: "admin.jpg" },
  intro: { title: "היכרות עם המערכת — מנהלי סניפים ומפקחים", file: "intro.mp4", poster: "intro.jpg" },
};

const shareSchema = new mongoose.Schema({
  token: { type: String, required: true },
  video: { type: String, required: true, enum: Object.keys(VIDEOS) },
  created_by: { type: String, default: null },
  created_at: { type: Date, default: () => new Date() },
  revoked_at: { type: Date, default: null },
  views: { type: Number, default: 0 },
  last_viewed_at: { type: Date, default: null },
}, { collection: "training_shares", versionKey: false });
shareSchema.index({ token: 1 }, { unique: true });
export const TrainingShare = mongoose.models.TrainingShare ?? mongoose.model("TrainingShare", shareSchema);

const router = Router();

function owner(req) {
  if (!req.user) throw unauthorized();
  if (!isDevToolsOwner(req.user)) throw forbidden("סרטוני ההדרכה זמינים למנהלת המערכת בלבד");
  return req.user;
}
const videoOf = (id) => {
  const v = Object.hasOwn(VIDEOS, String(id)) ? VIDEOS[id] : null;
  if (!v) throw new HttpError(404, "Not found");
  return v;
};
function send(res, file, type) {
  const full = path.join(MEDIA, file);
  if (!fs.existsSync(full)) throw new HttpError(404, "Not found");
  res.set("Cache-Control", "private, max-age=3600");
  res.type(type);
  res.sendFile(full, { acceptRanges: true });
}
const tokenOk = (t) => /^[A-Za-z0-9_-]{40,60}$/.test(String(t ?? ""));
async function activeShare(token) {
  if (!tokenOk(token)) throw new HttpError(404, "הקישור אינו תקף");
  const s = await TrainingShare.findOne({ token, revoked_at: null }).lean();
  if (!s || !VIDEOS[s.video]) throw new HttpError(404, "הקישור אינו תקף");
  return s;
}

router.get("/", ah(async (req, res) => {
  owner(req);
  const shares = await TrainingShare.find({ revoked_at: null }, { _id: 0 }).sort({ created_at: -1 }).lean();
  res.json({
    videos: Object.entries(VIDEOS).map(([id, v]) => ({ id, title: v.title, available: fs.existsSync(path.join(MEDIA, v.file)) })),
    shares: shares.map((s) => ({ token: s.token, video: s.video, created_at: s.created_at, views: s.views, last_viewed_at: s.last_viewed_at })),
  });
}));
router.get("/video/:id", ah(async (req, res) => { owner(req); send(res, videoOf(req.params.id).file, "video/mp4"); }));
router.get("/poster/:id", ah(async (req, res) => { owner(req); send(res, videoOf(req.params.id).poster, "image/jpeg"); }));

router.post("/shares", ah(async (req, res) => {
  const user = owner(req);
  const video = String(req.body?.video ?? "");
  if (!VIDEOS[video]) throw badRequest("סרטון לא מוכר");
  const token = randomBytes(32).toString("base64url");
  await TrainingShare.create({ token, video, created_by: user.id });
  logAction(user, "יצירת קישור צפייה לסרטון הדרכה", VIDEOS[video].title);
  res.json({ token, video });
}));
router.delete("/shares/:token", ah(async (req, res) => {
  const user = owner(req);
  const r = await TrainingShare.updateOne({ token: String(req.params.token), revoked_at: null }, { $set: { revoked_at: new Date() } });
  if (!r.matchedCount) throw new HttpError(404, "הקישור לא נמצא");
  logAction(user, "ביטול קישור צפייה לסרטון הדרכה", "-");
  res.json({ ok: true });
}));

// ── public (link holders): only the video itself, nothing else ──
router.get("/public/:token", ah(async (req, res) => {
  const s = await activeShare(req.params.token);
  await TrainingShare.updateOne({ token: s.token }, { $inc: { views: 1 }, $set: { last_viewed_at: new Date() } });
  res.set("Cache-Control", "no-store");
  res.json({ title: VIDEOS[s.video].title, video: s.video });
}));
router.get("/public/:token/video", ah(async (req, res) => { const s = await activeShare(req.params.token); send(res, VIDEOS[s.video].file, "video/mp4"); }));
router.get("/public/:token/poster", ah(async (req, res) => { const s = await activeShare(req.params.token); send(res, VIDEOS[s.video].poster, "image/jpeg"); }));

export default router;
