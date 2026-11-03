/**
 * POST /api/rpc/:name — server-side ports of the former Postgres RPC functions.
 * Same names, same parameter names (p_*), same JSON result shapes, so
 * src/lib/backend.ts only swaps its transport.
 *
 * Each module in server/rpc/ exports an object { [rpcName]: { auth, handler } }:
 *   auth: "public"  — anonymous allowed (worker link pages)
 *         "staff"   — signed in and past the first-login password change
 *         "admin"   — staff with role admin
 *   handler(params, ctx) → JSON-serialisable result; ctx = { user, req }
 */
import { Router } from "express";
import { ah, forbidden, HttpError, unauthorized } from "../errors.js";
import inventory from "../rpc/inventory.js";
import vehicles from "../rpc/vehicles.js";
import workerLinks from "../rpc/workerLinks.js";
import devtools from "../rpc/devtools.js";
import misc from "../rpc/misc.js";

export const REGISTRY = { ...inventory, ...vehicles, ...workerLinks, ...devtools, ...misc };

const VIEWER_READ = new Set([
  "needs_setup", "lookup_auth_id", "can_use_development_tools", "worker_link_status",
  "get_central_inventory_snapshot", "get_central_inventory_summary", "central_inventory_counts", "central_stock_available",
]);

const router = Router();

router.post("/:name", ah(async (req, res) => {
  const entry = REGISTRY[req.params.name] ?? { auth: "staff" };
  const user = req.user;
  if (entry.auth !== "public") {
    if (!user) throw unauthorized();
    if (user.requires_password_change) throw forbidden("יש לעדכן סיסמה לפני הכניסה למערכת");
    if (entry.auth === "admin" && user.role !== "admin") throw forbidden();
    if (entry.auth === "writer" && user.role === "viewer") throw forbidden();
  }
  // Viewers are read-only: only an explicit allow-list of read functions.
  if (user?.role === "viewer" && !VIEWER_READ.has(req.params.name)) throw forbidden();
  if (!entry.handler) throw new HttpError(404, `Unknown function ${req.params.name}`, "PGRST202");
  const data = await entry.handler(req.body ?? {}, { user, req });
  res.json({ data: data === undefined ? null : data });
}));

export default router;
