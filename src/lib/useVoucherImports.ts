import { toast } from "sonner";

import { MAIN_POOL } from "@/components/dashboard/voucherData";
import { parseFuelType } from "@/components/fuel/fuel";
import { isSheetFile, parseSheetFile, stripHeader } from "@/lib/parseSheet";
import { validateStockSheet } from "@/lib/validateStockSheet";
import { partitionStockRows, pazFeedbackCardNumbers } from "@/lib/importIntegrity";
import { useAppStore } from "@/store/appStore";

/**
 * Outcome of one import run. `message` is exactly the text the import tools have always shown;
 * the numeric fields let a page render a richer summary (e.g. ResultDialog) from the same numbers.
 */
export interface VoucherImportNotice {
  /** "stock" = ייבוא מאגר כרטיסים · "redeemed" = ייבוא קובץ מימושים (היזון חוזר מפז). */
  kind: "stock" | "redeemed";
  tone: "success" | "info" | "error";
  message: string;
  fileName?: string;
  /** stock: cards added. */
  added?: number;
  /** stock: duplicate cards skipped (server + local). */
  skipped?: number;
  /** redeemed: cards updated to 'מומש סופית'. */
  updated?: number;
}

/** Default reporter = the original toasts (ImportPanel behaviour). */
const toastNotice = (n: VoucherImportNotice) => void toast[n.tone](n.message);

/**
 * The two voucher import handlers (stock file / Paz redemption feedback), extracted UNCHANGED from
 * ImportPanel so the settings panel and the /vouchers page run the exact same logic and parsers.
 * Only the reporting is pluggable: by default every outcome is a toast, as before.
 */
export function useVoucherImports({
  notify = toastNotice,
  onStockImported,
}: {
  notify?: (notice: VoucherImportNotice) => void;
  /** Called after a successful stock import with the imported serials and their "valid until" column. */
  onStockImported?: (serials: string[], validity: Record<string, string>) => void;
} = {}) {
  const vouchers = useAppStore((s) => s.vouchers);
  const importVouchers = useAppStore((s) => s.importVouchers);
  const markSerialsRedeemed = useAppStore((s) => s.markSerialsRedeemed);

  async function handleStock(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const say = (tone: VoucherImportNotice["tone"], message: string, extra: Partial<VoucherImportNotice> = {}) =>
      notify({ kind: "stock", tone, message, fileName: file.name, ...extra });
    if (!isSheetFile(file.name)) return void say("error", "יש להעלות קובץ אקסל (xlsx, xls) או CSV");
    try {
      const all = await parseSheetFile(file);
      const checked = validateStockSheet(all, new Set(vouchers.map((v) => v.serial)));
      if (typeof checked === "string") return void say("error", `קובץ אקסל אינו תואם לתבנית הנדרשת. ${checked}`);
      const { accepted: raw, skipped: localSkipped } = partitionStockRows(checked, new Set(vouchers.map(v => v.serial)));
      if (!raw.length) return void say("info", `לא נוספו שוברים · ${localSkipped} כרטיסים כפולים דולגו`, { added: 0, skipped: localSkipped });
      const today = new Date().toISOString().slice(0, 10);
      const parsed = raw.map((r) => ({
          v: {
            serial: String(r[0] ?? "").trim(),
            realCode: String(r[1] ?? "").trim(),
            amount: Number(String(r[2] ?? "").replace(/[₪,\s]/g, "")),
            branch: MAIN_POOL,
            status: "טרם שומש" as const,
            updatedAt: today,
            fuelType: parseFuelType(r[3]),
          },
          validUntil: String(r[4] ?? "").trim(),
        }));
      const result = await importVouchers(parsed.map((p) => p.v));
      onStockImported?.(result.serials, Object.fromEntries(parsed.map((p) => [p.v.serial, p.validUntil])));
      say("success", `נוספו ${result.added} שוברים · ${result.skipped + localSkipped} כרטיסים כפולים דולגו`, {
        added: result.added,
        skipped: result.skipped + localSkipped,
      });
    } catch (error) {
      say("error", error instanceof Error ? error.message : "ייבוא הקובץ נכשל");
    }
  }

  async function handleRedeemed(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const say = (tone: VoucherImportNotice["tone"], message: string, extra: Partial<VoucherImportNotice> = {}) =>
      notify({ kind: "redeemed", tone, message, fileName: file.name, ...extra });
    if (!isSheetFile(file.name)) return void say("error", "יש להעלות קובץ אקסל (xlsx, xls) או CSV");
    try {
      const raw = stripHeader(await parseSheetFile(file), "כרטיס");
      const serials = pazFeedbackCardNumbers(raw);
      if (!serials.length) return void say("error", "לא נמצאו מספרי כרטיסים בקובץ");
      const updated = await markSerialsRedeemed(serials);
      if (!updated) return void say("info", "מספרי הכרטיסים בקובץ לא נמצאו במאגר או שכבר מומשו", { updated: 0 });
      say("success", `עודכנו בהצלחה ${updated} שוברים לסטטוס 'מומש סופית'`, { updated });
    } catch (error) {
      say("error", error instanceof Error ? error.message : "ייבוא היזון חוזר נכשל");
    }
  }

  return { handleStock, handleRedeemed };
}
