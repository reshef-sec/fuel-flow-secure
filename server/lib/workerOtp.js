/**
 * One-time codes for employee links. The code is stored only as a hash. It goes out by SMS; when
 * SMS can't deliver it (not set up, provider error) it is handed back once to the issuer, so the
 * voucher is never stranded. Demo links never send a real SMS.
 */
import { createHash, randomInt } from "node:crypto";
import { WorkerLink } from "../models.js";
import { inLearning } from "./learningContext.js";
import { sendSms } from "./sms.js";

export const OTP_MAX_ATTEMPTS = 5;
const OTP_VALID_MS = 7 * 24 * 60 * 60 * 1000;

export const otpHash = (linkId, code) =>
  createHash("sha256").update(`${linkId}:${code}:${process.env.JWT_SECRET}`).digest("hex");

export const otpFields = (linkId, code) => ({
  otp_hash: otpHash(linkId, code), otp_expires_at: new Date(Date.now() + OTP_VALID_MS), otp_attempts: 0, otp_sent_at: new Date(),
});

const baseUrl = (req) => (process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

/** Starts a fresh code for a link and delivers it. Returns { sms_sent, otp? }. */
export async function sendLinkCode(link, req) {
  const code = String(randomInt(0, 10000)).padStart(4, "0");
  await WorkerLink.updateOne({ id: link.id }, { $set: otpFields(link.id, code) });
  const url = `${baseUrl(req)}/v/${encodeURIComponent(link.id)}`;
  const text = `שלום ${link.employee_name ?? ""}, שוברי הדלק שלך מרשף ביטחון: ${url} קוד אימות: ${code}`;
  const sent = !inLearning() && await sendSms(link.phone, text);
  return sent ? { sms_sent: true } : { sms_sent: false, otp: code };
}
