/**
 * Separate rate limits for the public employee endpoints and the internal management API, so a
 * traffic spike on employee links can never use up the management dashboard's allowance.
 * Counters live in this process. Override with RATE_LIMIT_PUBLIC_PER_MIN / RATE_LIMIT_INTERNAL_PER_MIN.
 */
import rateLimit from "express-rate-limit";
import { clientAddress } from "./requestContext.js";

const PUBLIC_RPC = new Set(["worker_link_status", "open_worker_wallet", "reveal_worker_code", "sign_worker_link"]);

/** Employee links and shared training videos: reachable without an account. */
export function isPublicRequest(req) {
  const rpc = /^\/rpc\/([^/]+)$/.exec(req.path);
  return Boolean(rpc && PUBLIC_RPC.has(rpc[1])) || req.path.startsWith("/training/public/");
}

const limiter = (limit, keyGenerator) => rateLimit({
  windowMs: 60_000,
  limit,
  keyGenerator,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "יותר מדי בקשות. נסו שוב בעוד דקה", code: "rate_limited" }),
});

export function createRateLimits({ publicPerMin, internalPerMin } = {}) {
  // Per address. Generous, because employees on one mobile carrier can share an address.
  const pub = limiter(publicPerMin ?? (Number(process.env.RATE_LIMIT_PUBLIC_PER_MIN) || 300), clientAddress);
  // Per signed-in user, so a whole office behind one address is not counted as one person.
  const internal = limiter(internalPerMin ?? (Number(process.env.RATE_LIMIT_INTERNAL_PER_MIN) || 1500), (req) => req.user?.id ?? clientAddress(req));
  return {
    /** Runs before authentication: public traffic never reaches the session lookup. */
    publicApi: (req, res, next) => (isPublicRequest(req) ? pub(req, res, next) : next()),
    /** Runs after authentication, so requests can be counted per user. */
    internalApi: (req, res, next) => (isPublicRequest(req) ? next() : internal(req, res, next)),
  };
}
