import { forwardRef, useRef, useState } from "react";
import { ImageDown } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/design-system/delek-1ea111";
import { formatIsraelDate } from "@/lib/israelDate";
import type { CachedCode } from "@/lib/voucherCache";

const ils = (n: number) => `${n.toLocaleString("he-IL")} ₪`;

/** The image itself: plain styles only, so it renders the same on every phone. */
const ExportCard = forwardRef<HTMLDivElement, { name: string; total: number; codes: CachedCode[] }>(function ExportCard({ name, total, codes }, ref) {
  return (
    <div ref={ref} dir="rtl" style={{ width: 420, padding: 24, background: "#ffffff", color: "#0b1f4b", fontFamily: "Heebo, Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #0b1f4b", paddingBottom: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>שוברי דלק</div>
          <div style={{ fontSize: 14 }}>{name}</div>
          <div style={{ fontSize: 13, color: "#4d5b73" }}>{formatIsraelDate(new Date().toISOString())}</div>
        </div>
        <Logo variant="color" className="h-[64px]" />
      </div>
      <div style={{ padding: "12px 0", fontSize: 16, fontWeight: 700 }}>סה״כ: {ils(total)}</div>
      {codes.map((c) => (
        <div key={c.serial} style={{ border: "2px dashed #7fa6e6", borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{c.fuelType === "סולר" ? "סולר" : "בנזין 95"} · {ils(c.amount)}</div>
          <div dir="ltr" style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, textAlign: "right" }}>{c.revealed ? c.realCode : "••••••••••"}</div>
        </div>
      ))}
    </div>
  );
});

/** Saves the wallet as an image: the share sheet on phones (Save to gallery), a download elsewhere. */
export function VoucherExport({ name, total, codes }: { name: string; total: number; codes: CachedCode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: "#ffffff" });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("no image");
      const fileName = "reshef-fuel-vouchers.png";
      const file = new File([blob], fileName, { type: "image/png" });
      // Phones offer "save image" in the share sheet; anything else downloads the file.
      if (navigator.maxTouchPoints > 0 && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "שוברי דלק" });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return; // the person closed the sheet
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("voucher image failed:", e);
      toast.error("שמירת התמונה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="ds-btn ds-btn-light w-full" onClick={() => void save()} disabled={busy} aria-busy={busy}>
        <ImageDown className="size-4" aria-hidden />
        הורדת שוברים לגלריה
      </button>
      {/* Off screen, not hidden: html2canvas needs it laid out. */}
      <div aria-hidden style={{ position: "fixed", top: 0, left: -10000 }}>
        <ExportCard ref={ref} name={name} total={total} codes={codes} />
      </div>
    </>
  );
}
