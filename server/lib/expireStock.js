/**
 * A card that was not issued to a worker within 3 months of entering stock is no longer valid: it
 * becomes חסום and can't be allocated or issued. Runs at startup, every hour, and right before any
 * allocation or issuance. blocked_at marks these cards, so a bulk change can be traced or reversed.
 */
import { Voucher } from "../models.js";
import { STATUS } from "./canonical.js";
import { logAction } from "./audit.js";
import { addMonths } from "./issuanceGuard.js";
import { runInLearning } from "./learningContext.js";

const STOCK_LIFETIME_MONTHS = 3;
const HOUR = 60 * 60 * 1000;
const unset = { $in: [null, ""] };

export async function blockExpiredStock(now = new Date()) {
  const r = await Voucher.updateMany({
    status: { $in: [STATUS.AVAILABLE, "available"] },
    created_at: { $lte: addMonths(now, -STOCK_LIFETIME_MONTHS) },
    link_id: unset, worker_id: unset, worker_name: unset,
  }, { $set: { status: STATUS.BLOCKED, blocked_at: now, updated_on: now.toISOString().slice(0, 10) } });
  if (r.modifiedCount) logAction(null, "חסימת שוברים שלא הונפקו תוך 3 חודשים", `${r.modifiedCount} שוברים`, { count: r.modifiedCount });
  return r.modifiedCount;
}

export function scheduleStockExpiry() {
  const sweep = () => Promise.all([blockExpiredStock(), runInLearning(() => blockExpiredStock())])
    .catch((e) => console.warn("stock expiry failed:", e.message));
  void sweep();
  setInterval(sweep, HOUR).unref();
}
