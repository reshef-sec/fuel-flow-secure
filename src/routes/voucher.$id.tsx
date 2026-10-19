import { FuelBadge } from "@/components/fuel/fuel";
import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Copy, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, Checkbox, FormField, Input, Logo } from "@/design-system/delek-1ea111";
import { getWorkerLinkStatus, openWorkerWallet, signWorkerLink } from "@/lib/backend";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoucherWallet,
});

type Step = "identify" | "sign" | "wallet";

type Code = { serial: string; realCode: string; amount: number; fuelType?: "בנזין" | "סולר" };

function VoucherWallet() {
  const { id } = Route.useParams();
  const [ready, setReady] = useState(false);
  const [link, setLink] = useState<{ total: number; signed: boolean } | null>(null);
  const [blocked, setBlocked] = useState<"locked" | "expired" | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const fetchStatus = getWorkerLinkStatus;
  const openWallet = openWorkerWallet;
  const signFn = signWorkerLink;

  const [step, setStep] = useState<Step>("identify");
  const [fullName, setFullName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [consent, setConsent] = useState(false);
  const [nameLocked, setNameLocked] = useState(false);

  useEffect(() => {
    if (!/^\d{4,12}$/.test(id)) {
      setReady(true);
      return;
    }
    fetchStatus({ data: { id } })
      .then((r) => {
        if (r.exists && r.state !== "ok") setBlocked(r.state);
        setLink(r.exists ? { total: r.total, signed: r.signed } : null);
        if (r.exists && r.employeeName) {
          setFullName(r.employeeName);
          setNameLocked(true);
        }
      })
      .catch(() => setLink(null))
      .finally(() => setReady(true));
  }, [id, fetchStatus]);

  async function identify(e: React.FormEvent) {
    e.preventDefault();
    if (fullName.trim().length < 2) return setError("נא להזין שם מלא");
    if (!/^\d{9}$/.test(idNumber)) return setError("ת.ז חייבת להכיל 9 ספרות");
    if (!/^0\d{8,9}$/.test(phone)) return setError("מספר טלפון לא תקין (ספרות בלבד)");
    if (!link) return;
    if (link.signed) {
      const r = await openWallet({ data: { id, workerId: idNumber, phone } });
      if (r.ok) {
        setCodes(r.codes);
        setError(null);
        setStep("wallet");
      } else if (r.state === "locked" || r.state === "expired") setBlocked(r.state);
      else setError(`הפרטים אינם תואמים לבעל הלינק · נותרו ${r.attemptsLeft} ניסיונות`);
      return;
    }
    setError(null);
    setStep("sign");
  }

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    if (!hasSignature || !signature || !consent) return setError("נדרשת חתימה ואישור קבלה");
    const r = await signFn({
      data: { id, workerId: idNumber, phone, fullName: fullName.trim(), signature },
    });
    if (!r.ok) return setError("הלינק כבר נחתם על ידי עובד אחר");
    setCodes(r.codes);
    setError(null);
    setStep("wallet");
    toast.success("החתימה נשמרה — הקודים זמינים");
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md" padding="none" radius="xl">
        <div className="flex flex-col items-center gap-3 border-b border-border px-6 py-6">
          <Logo className="h-24 sm:h-28" />
          <div className="w-full rounded-md bg-mint-100 px-4 py-2 text-center">
            <h1 className="font-display text-lg font-extrabold text-secondary">
              {step === "wallet" ? "הארנק הדיגיטלי שלי" : "קבלת שוברי דלק"}
            </h1>
          </div>
        </div>

        <div className="px-6 py-6">
          {!ready ? (
            <p className="text-center text-sm text-muted-foreground">טוען…</p>
          ) : blocked === "locked" ? (
            <div className="space-y-2 text-center">
              <p className="font-display text-lg font-extrabold text-danger">הלינק ננעל</p>
              <p className="text-sm text-muted-foreground">הוזנו פרטים שגויים 3 פעמים. יש לפנות למי שהפיק את השובר לשחרור הלינק.</p>
            </div>
          ) : blocked === "expired" ? (
            <div className="space-y-2 text-center">
              <p className="font-display text-lg font-extrabold text-danger">פג תוקף הלינק</p>
              <p className="text-sm text-muted-foreground">הלינק היה בתוקף 3 חודשים מיום ההפקה. יש לפנות למי שהפיק את השובר.</p>
            </div>
          ) : !link ? (
            <p className="text-center font-semibold text-danger">הלינק אינו תקף או שפג תוקפו</p>
          ) : step === "identify" ? (
            <form onSubmit={identify} className="flex flex-col gap-5" noValidate>
              <p className="text-center text-sm text-muted-foreground">
                סה"כ {link.total.toLocaleString("he-IL")} ₪ · הזדהו כדי להמשיך
              </p>
              {nameLocked ? (
                <div className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground">שם העובד</p>
                  <p className="font-display text-lg font-extrabold text-secondary">{fullName}</p>
                </div>
              ) : (
              <FormField label="שם מלא">
                <Input
                  aria-label="שם מלא"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value.slice(0, 80))}
                  required
                  autoComplete="name"
                  placeholder="שם פרטי ומשפחה"
                />
              </FormField>
              )}
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
              <Button type="submit" size="lg" block disabled={!fullName.trim() || !idNumber || !phone}>
                <KeyRound className="size-5" />
                המשך
              </Button>
            </form>
          ) : step === "sign" ? (
            <form onSubmit={sign} className="flex flex-col gap-5">
              <ClientOnly fallback={<div className="h-[186px] rounded-md border-2 border-dashed border-blue-300" />}>
                <Suspense fallback={<div className="h-[186px] rounded-md border-2 border-dashed border-blue-300" />}>
                  <SignatureField onChange={setHasSignature} onCapture={setSignature} />
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
              {(() => {
                const b = codes.filter((c) => c.fuelType !== "סולר").length;
                const d = codes.length - b;
                return b && d ? (
                  <p className="text-center text-xs font-bold text-muted-foreground">
                    {b} בנזין <span className="mx-1">|</span> {d} סולר
                  </p>
                ) : null;
              })()}
              {codes.map((v) => (
                <div
                  key={v.serial}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-primary bg-blue-100/60 px-4 py-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <FuelBadge fuel={v.fuelType} size="lg" />
                      <span className="font-display text-lg font-extrabold tabular-nums text-secondary">{v.amount} ₪</span>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground">מותר לתדלוק {v.fuelType === "סולר" ? "סולר" : "בנזין 95"} בלבד</p>
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
