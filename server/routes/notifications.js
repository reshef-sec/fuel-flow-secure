/**
 * Notifications by lightweight polling:
 * GET /api/notifications?since=<ISO>
 *   admin      → voucher_requests created after `since`
 *   supervisor → vouchers newly assigned to me after `since` (sum of amounts)
 */
import { Router } from "express";
import { Voucher, VoucherRequest } from "../models.js";
import { ah } from "../errors.js";
import { requireAuth } from "../auth.js";

const router = Router();

router.get("/", requireAuth, ah(async (req, res) => {
  const now = new Date();
  const since = new Date(String(req.query.since ?? ""));
  if (Number.isNaN(since.getTime())) return res.json({ now: now.toISOString(), requests: [], assigned: { count: 0, total: 0 } });
  const u = req.user;
  const out = { now: now.toISOString(), requests: [], assigned: { count: 0, total: 0 } };
  if (u.role === "admin") {
    out.requests = await VoucherRequest.find({ created_at: { $gt: since, $lte: now } }, { _id: 0, requester: 1, branch: 1, amount: 1 }).lean();
  }
  if (u.role === "supervisor") {
    const rows = await Voucher.find({ supervisor_id: u.id, updated_at: { $gt: since, $lte: now }, status: "טרם שומש" }, { amount: 1 }).lean();
    out.assigned = { count: rows.length, total: rows.reduce((s, r) => s + Number(r.amount ?? 0), 0) };
  }
  res.json(out);
}));

export default router;
