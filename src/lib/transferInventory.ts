import { db } from "./cloudSync";
import { parseIssuanceResponse } from "./issuanceResponse";

export interface StockTransferItem {
  amount: number;
  fuel_type: "בנזין" | "סולר";
  serials: string[];
  details?: Record<string, string | undefined>;
}

/** The database locks, verifies and transfers the cards in a single transaction. */
export async function transferInventory(items: StockTransferItem[], branch: string, supervisor?: string, link?: { id: string; employee_name: string; phone: string }) {
  const { error } = await db.rpc("transfer_voucher_stock", {
    p_items: items, p_branch: branch, p_supervisor: supervisor ?? null, p_link: link ?? null,
  });
  if (error) throw new Error(error.code === "PGRST202"
    ? "יש להריץ תחילה את סקריפט בדיקת המלאי ושמירת ההקצאות במסד הנתונים" : error.message);
}
export interface IssueItem { amount: number; fuel_type: "בנזין" | "סולר"; details?: Record<string, string | undefined> }

/** Database picks, locks (FOR UPDATE SKIP LOCKED) and issues matching cards atomically, plus the link row. */
export async function issueVoucherToWorker(items: IssueItem[], branch: string, supervisor: string | undefined, link: { id: string; employee_name: string; phone: string }) {
  const { data, error } = await db.rpc("issue_voucher_to_worker", {
    p_items: items, p_branch: branch, p_supervisor: supervisor ?? null, p_link: link,
  });
  if (error) throw new Error(error.code === "PGRST202"
    ? "יש להריץ תחילה את סקריפט issue_voucher_to_worker במסד הנתונים" : error.message);
  return parseIssuanceResponse(data, link.id, items.length);
}
