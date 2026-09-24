import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Copy, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, Checkbox, FormField, Input, Logo } from "@/design-system/delek-1ea111";
import { useAppStore } from "@/store/appStore";

const SignatureField = lazy(() => import("@/components/worker/SignatureField"));

/** Standalone public page — digital wallet for a worker's voucher link. */
export const Route = createFileRoute("/voucher/$id")({
  head: () => ({
    meta: [
      { title: "ארנק שוברי דלק | רשף ביטחון" },
      { name: "description", content: "לינק אישי לקבלת שוברי דלק: זיהוי בת.ז וטלפון, חתימה והצגת הקודים." },
      { property: "og:title", content: "ארנק שוברי דלק | רשף ביטחון" },
      { property: "og:description", content: "זיהוי, חתימה דיגיטלית והצגת קודי שוברי הדלק שלך." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VoucherWallet,
});

type Step = "identify" | "sign" | "wallet";

function VoucherWallet() {
  const { id } = Route.useParams();
  const [ready, setReady] = useState(false);
  const link = useAppStore((s) => s.links.find((l) => l.id === id));
  const vouchers = useAppStore((s) => s.vouchers);
  const signLink = useAppStore((s) => s.signLink);

  const [step, setStep] = useState<Step>("identify");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    void Promise.resolve(useAppStore.persist.rehydrate()).then(() => setReady(true));
  }, []);

  const codes = link ? vouchers.filter((v) => link.serials.includes(v.serial)) : [];

  function identify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{9}$/.test(idNumber)) return setError("ת.ז חייבת להכיל 9 ספרות");
    if (!/^0\d{8,9}$/.test(phone)) return setError("מספר טלפון לא תקין (ספרות בלבד)");
    if (!link) return;
    if (link.workerId) {
      if (link.workerId === idNumber && link.phone === phone) {
        setError(null);
        setStep("wallet");
      } else setError("הפרטים אינם תואמים לבעל הלינק");
      return;
    }
    setError(null);
    setStep("sign");
  }

  function sign(e: React.FormEvent) {
    e.preventDefault();
    if (!hasSignature || !consent) return setError("נדרשת חתימה ואישור קבלה");
    signLink(id, idNumber, phone);
    setError(null);
    setStep("wallet");
    toast.success("החתימה נשמרה — הקודים זמינים");
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md" padding="none" radius="xl">
        <div className="flex flex-col items-center gap-3 border-b border-border px-6 py-6">
          <Logo size="lg" />
          <div className="w-full rounded-md bg-mint-100 px-4 py-2 text-center">
            <h1 className="font-display text-lg font-extrabold text-secondary">
              {step === "wallet" ? "הארנק הדיגיטלי שלי" : "קבלת שוברי דלק"}
            </h1>
          </div>
        </div>

        <div className="px-6 py-6">
          {!ready ? (
            <p className="text-center text-sm text-muted-foreground">טוען…</p>
          ) : !link ? (
            <p className="text-center font-semibold text-danger">הלינק אינו תקף או שפג תוקפו</p>
          ) : step === "identify" ? (
            <form onSubmit={identify} className="flex flex-col gap-5" noValidate>
              <p className="text-center text-sm text-muted-foreground">
                סה"כ {link.total.toLocaleString("he-IL")} ₪ · הזדהו כדי להמשיך
              </p>
              <FormField label="ת.ז.">
                <Input
                  aria-label="ת.ז."
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  inputMode="numeric"
                  pattern="\d{9}"
                  required
                  placeholder="9 ספרות"
                />
              </FormField>
              <FormField label="טלפון">
                <Input
                  aria-label="טלפון"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  pattern="0\d{8,9}"
                  required
                  placeholder="05XXXXXXXX"
                />
              </FormField>
              {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
              <Button type="submit" size="lg" block disabled={!idNumber || !phone}>
                <KeyRound className="size-5" />
                המשך
              </Button>
            </form>
          ) : step === "sign" ? (
            <form onSubmit={sign} className="flex flex-col gap-5">
              <ClientOnly fallback={<div className="h-[186px] rounded-md border-2 border-dashed border-blue-300" />}>
                <Suspense fallback={<div className="h-[186px] rounded-md border-2 border-dashed border-blue-300" />}>
                  <SignatureField onChange={setHasSignature} />
                </Suspense>
              </ClientOnly>
              <Checkbox
                label="אני מאשר/ת קבלת שוברי דלק"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
              <Button type="submit" size="lg" block disabled={!hasSignature || !consent}>
                <ShieldCheck className="size-5" />
                חתימה וקבלת הקודים
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-secondary">
                <Wallet className="size-4 text-primary" />
                {codes.length} קודים פעילים · {link.total.toLocaleString("he-IL")} ₪
              </p>
              {codes.map((v) => (
                <div
                  key={v.serial}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-primary bg-blue-100/60 px-4 py-3"
                >
                  <div>
                    <p className="text-xs text-muted-foreground">{v.amount} ₪</p>
                    <p dir="ltr" className="font-display text-lg font-extrabold tracking-wider text-secondary">
                      {v.realCode}
                    </p>
                  </div>
                  <button
                    aria-label={`העתק ${v.realCode}`}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(v.realCode);
                        toast.success("הקוד הועתק");
                      } catch {
                        toast.error("ההעתקה נכשלה");
                      }
                    }}
                    className="grid size-10 place-items-center rounded-md text-primary hover:bg-surface"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
