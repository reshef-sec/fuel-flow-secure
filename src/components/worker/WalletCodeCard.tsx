import { useEffect, useState } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

/**
 * WalletCodeCard — one fuel code in the employee's digital wallet (design: Worker.dc.html).
 * Dashed "coupon" card: fuel chip + amount, the fuel rule line, the code in large mono, and a copy button.
 * `onCopy` performs the copy (and its own toasts); the button shows "הועתק" for 2s when it resolves true.
 * `code` null = not revealed yet: a blurred placeholder (the real code is not on the phone at all) and a
 * reveal button; `onReveal` asks the server, which keeps that code revealed from then on.
 */
export function WalletCodeCard({
  fuelType,
  amount,
  code,
  onReveal,
  onCopy,
}: {
  fuelType?: "בנזין" | "סולר";
  amount: number;
  code: string | null;
  onReveal: () => Promise<void>;
  onCopy: () => Promise<boolean>;
}) {
  const [copied, setCopied] = useState(false);
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const diesel = fuelType === "סולר";

  return (
    <article className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-[#7fa6e6] bg-[#f2f6fe] p-3.5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex rounded-lg border px-2.5 py-[3px] text-[12.5px] font-bold",
              diesel ? "border-[#c9d6ee] bg-white text-navy-700" : "border-[#bfe9e0] bg-[#effaf7] text-available-fg",
            )}
          >
            {diesel ? "סולר" : "בנזין 95"}
          </span>
          <span className="ds-num text-lg font-semibold text-navy-700">{amount} ₪</span>
        </div>
        <span className="text-xs font-semibold text-slate-600">מותר לתדלוק {diesel ? "סולר" : "בנזין 95"} בלבד</span>
        {code ? (
          <span dir="ltr" className="ds-num text-right text-[21px] font-semibold tracking-[.06em] text-navy-900 [overflow-wrap:anywhere]">
            {code}
          </span>
        ) : (
          <span aria-hidden dir="ltr" className="ds-num select-none text-right text-[21px] font-semibold tracking-[.06em] text-navy-900 blur-[7px]">
            000000000000
          </span>
        )}
      </div>
      {code ? (
        <button
          type="button"
          aria-label={`העתק ${code}`}
          onClick={async () => setCopied(await onCopy())}
          className={cn(
            "flex min-h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-xl border text-[11.5px] font-bold focus-visible:shadow-focus-mint focus-visible:outline-none",
            copied ? "border-available bg-available text-white" : "border-[#c9d8f3] bg-white text-blue-500 hover:bg-[#f2f6fe]",
          )}
        >
          {copied ? <Check className="size-[18px]" aria-hidden /> : <Copy className="size-[18px]" aria-hidden />}
          {copied ? "הועתק" : "העתק"}
        </button>
      ) : (
        <button
          type="button"
          aria-label={`חשיפת קוד ${diesel ? "סולר" : "בנזין 95"} ${amount} ₪`}
          disabled={revealing}
          aria-busy={revealing}
          onClick={async () => {
            setRevealing(true);
            await onReveal();
            setRevealing(false);
          }}
          className="flex min-h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-xl border border-blue-500 bg-blue-500 text-[11.5px] font-bold text-white hover:bg-blue-600 focus-visible:shadow-focus-mint focus-visible:outline-none disabled:opacity-60"
        >
          <Eye className="size-[18px]" aria-hidden />
          חשיפה
        </button>
      )}
    </article>
  );
}
