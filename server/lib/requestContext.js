import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request context: the visitor's address, available to anything that runs for that request. */
const store = new AsyncLocalStorage();

/** The site sits behind Cloudflare, so the visitor is in CF-Connecting-IP; req.ip can be a shared edge address. */
export function clientAddress(req) {
  return String(req.get("cf-connecting-ip") || req.ip || "").replace(/^::ffff:/, "");
}

export const requestContext = (req, _res, next) => store.run({ ip: clientAddress(req) }, next);

/** The current request's address, or "-" for work that no request started (startup, migrations). */
export const currentIp = () => store.getStore()?.ip || "-";
