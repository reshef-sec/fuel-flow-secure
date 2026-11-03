import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Check } from "lucide-react";

import { Button } from "@/design-system/delek-1ea111";

export function SuccessView({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setToast("הקוד הועתק ללוח");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast("ההעתקה נכשלה — נא להעתיק ידנית");
    }
  };

  return (
    <div className="flex animate-[fadeIn_.35s_ease-out] flex-col items-center gap-5 px-6 py-10 text-center">
      <span className="grid size-20 place-items-center rounded-pill bg-available-bg">
        <CheckCircle2 className="size-12 text-available" aria-hidden />
      </span>

      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-2xl font-extrabold text-navy-900">השובר אושר בהצלחה</h2>
        <p className="m-0 text-sm text-slate-600">
          הציגו את הקוד בתחנת הדלק לקבלת השובר.
        </p>
      </div>

      <div className="w-full rounded-2xl border-2 border-dashed border-[#7fa6e6] bg-[#f2f6fe] px-4 py-5">
        <span className="block text-xs font-semibold text-blue-700">קוד השובר</span>
        <span dir="ltr" className="ds-num mt-1 block text-3xl font-semibold tracking-widest text-navy-900">
          {code}
        </span>
      </div>

      <Button type="button" size="lg" block variant={copied ? "accent" : "primary"} onClick={copy}>
        {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
        {copied ? "הקוד הועתק" : "העתק קוד"}
      </Button>

      <div aria-live="polite" className="min-h-6">
        {toast ? (
          <span className="inline-flex items-center gap-2 rounded-pill bg-navy-900 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-raised">
            <Check className="size-4" />
            {toast}
          </span>
        ) : null}
      </div>
    </div>
  );
}
