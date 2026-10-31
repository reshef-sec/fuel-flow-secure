import { db } from "./cloudSync";

export interface StockTransferItem {
  amount: number;
  fuel_type: "בנזין" | "סולר";
  serials: string[];
  details?: Record<string, string | undefined>;
}

/** The database locks, verifies and transfers the cards in a single transaction. */
export async function transferInventory(items: StockTransferItem[], branch: string, supervisor?: string, link?: { id: string; employee_name: string }) {
  const { error } = await db.rpc("transfer_voucher_stock", {
    p_items: items, p_branch: branch, p_supervisor: supervisor ?? null, p_link: link ?? null,
  });
  if (error) throw new Error(error.code === "PGRST202"
    ? "יש להריץ תחילה את סקריפט בדיקת המלאי ושמירת ההקצאות במסד הנתונים" : error.message);
}