/**
 * Short-lived cache for the public link status read (worker_link_status), so repeat visits and
 * refreshes of an employee link do not touch MongoDB.
 *
 * Holds only what that read already shows anyone with the link: never redemption codes, national
 * ids or phones. Identity checks and the wallet always read the database.
 * Entries are dropped on every write to a link (see the hooks in models.js), so a signature, lock
 * or unlock shows at once; the 60s TTL is only a backstop. The cache is per process: running more
 * than one server instance would need a shared store.
 */
import { LRUCache } from "lru-cache";
import { inLearning } from "./learningContext.js";

const cache = new LRUCache({ max: 20000, ttl: 60_000 });
const keyOf = (id) => `${inLearning() ? "demo" : "real"}:${id}`;

export const cachedLink = (id) => cache.get(keyOf(id));
export const rememberLink = (id, link) => { cache.set(keyOf(id), link); };
export const forgetLink = (id) => { cache.delete(`real:${id}`); cache.delete(`demo:${id}`); };
export const forgetAllLinks = () => { cache.clear(); };
