import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AlertCircle, CalendarX2, CheckCircle2, KeyRound, Lock, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { getWorkerLinkStatus, openWorkerWallet, signWorkerLink } from "@/lib/backend";
import { StepIndicator } from "@/components/worker/StepIndicator";
import { WalletCodeCard } from "@/components/worker/WalletCodeCard";

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

const STEP_NAMES = ["הזדהות", "חתימה", "ארנק"] as const;
const STEP_KEYS: Step[] = ["identify", "sign", "wallet"];

const fieldCls =
  "h-[50px] w-full rounded-control border border-line-strong bg-white px-3 text-right text-base text-navy-900 outline-none transition placeholder:text-slate-400 focus:shadow-focus-mint aria-[invalid=true]:border-redeemed aria-[invalid=true]:bg-[#fffafa]";
const labelCls = "flex flex-col gap-[7px] text-[13.5px] font-semibold text-ink-soft";
const cardCls = "flex flex-col gap-4 rounded-[18px] border border-line bg-white px-[18px] py-5 shadow-[0_1px_2px_rgba(11,17,64,.03),0_10px_30px_rgba(11,17,64,.06)]";
const primaryBtn = "ds-btn ds-btn-primary min-h-[52px] w-full text-[15.5px] disabled:!bg-[#c7d3e6] disabled:!opacity-100 disabled:shadow-none";

function StateCard({ tone, icon, title, children }: { tone: "red" | "amber"; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className={cn(cardCls, "items-center px-5 py-[30px] text-center")} role="alert">
      <span className={cn("grid size-[72px] place-items-center rounded-full", tone === "red" ? "bg-redeemed-bg text-redeemed" : "bg-pending-bg text-[#a86d00]")}>
        {icon}
      </span>
      <h2 className="m-0 text-[21px] font-extrabold text-redeemed-fg">{title}</h2>
      <p className="m-0 text-[14.5px] leading-relaxed text-slate-600">{children}</p>
    </section>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-redeemed-bg px-[13px] py-[11px] text-[13.5px] font-semibold leading-normal text-redeemed-fg">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

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

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("הקוד הועתק");
      return true;
    } catch {
      toast.error("ההעתקה נכשלה");
      return false;
    }
  }

  const inFlow = ready && !blocked && Boolean(link);
  const petrolCount = codes.filter((c) => c.fuelType !== "סולר").length;
  const dieselCount = codes.length - petrolCount;

  return (
    <div dir="rtl" className="min-h-screen bg-page font-sans text-navy-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        <header className="flex flex-col items-center gap-3 border-b border-line bg-white px-[18px] pb-4 pt-[18px] min-[480px]:mt-6 min-[480px]:rounded-t-[18px] min-[480px]:border-x min-[480px]:border-t">
          <Logo variant="color" className="h-[84px]" />
          <div className="w-full rounded-xl bg-available-bg px-3.5 py-2.5 text-center">
            <h1 className="m-0 text-lg font-extrabold text-navy-900">
              {step === "wallet" ? "הארנק הדיגיטלי שלי" : "קבלת שוברי דלק"}
            </h1>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-3.5 px-4 pb-6 pt-4">
          {inFlow ? <StepIndicator steps={STEP_NAMES} current={STEP_KEYS.indexOf(step)} /> : null}

          {!ready ? (
            <p className="py-10 text-center text-sm text-slate-600" aria-busy="true">טוען…</p>
          ) : blocked === "locked" ? (
            <StateCard tone="red" icon={<Lock className="size-8" aria-hidden />} title="הלינק ננעל">
              הוזנו פרטים שגויים 3 פעמים. יש לפנות למי שהפיק את השובר לשחרור הלינק.
            </StateCard>
          ) : blocked === "expired" ? (
            <StateCard tone="amber" icon={<CalendarX2 className="size-8" aria-hidden />} title="פג תוקף הלינק">
              הלינק היה בתוקף 3 חודשים מיום ההפקה. יש לפנות למי שהפיק את השובר.
            </StateCard>
          ) : !link ? (
            <section className={cn(cardCls, "items-center py-8 text-center")} role="alert">
              <span className="grid size-[72px] place-items-center rounded-full bg-redeemed-bg text-redeemed">
                <AlertCircle className="size-8" aria-hidden />
              </span>
              <p className="m-0 font-semibold text-redeemed-fg">הלינק אינו תקף או שפג תוקפו</p>
            </section>
          ) : step === "identify" ? (
            <form onSubmit={identify} className={cardCls} aria-label="הזדהות" noValidate>
              <p className="m-0 text-center text-sm text-slate-600">
                סה"כ <span className="ds-num font-semibold text-navy-900">{link.total.toLocaleString("he-IL")} ₪</span> · הזדהו כדי להמשיך
              </p>
              {nameLocked ? (
                <div className="rounded-xl border border-line bg-table-head px-3.5 py-3 text-center">
                  <p className="m-0 text-xs text-slate-600">שם העובד</p>
                  <p className="m-0 text-[19px] font-extrabold text-navy-700">{fullName}</p>
                </div>
              ) : (
                <label className={labelCls}>
                  שם מלא
                  <input
                    aria-label="שם מלא"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value.slice(0, 80))}
                    required
                    autoComplete="name"
                    placeholder="שם פרטי ומשפחה"
                    className={fieldCls}
                  />
                </label>
              )}
              <label className={labelCls}>
                ת.ז.
                <input
                  aria-label="ת.ז."
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  inputMode="numeric"
                  pattern="\d{9}"
                  required
                  autoComplete="off"
                  dir="ltr"
                  placeholder="9 ספרות"
                  aria-invalid={error && error.includes("ת.ז") ? true : undefined}
                  className={fieldCls}
                />
              </label>
              <label className={labelCls}>
                טלפון
                <input
                  aria-label="טלפון"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  pattern="0\d{8,9}"
                  required
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="05XXXXXXXX"
                  aria-invalid={error && error.includes("טלפון") ? true : undefined}
                  className={fieldCls}
                />
              </label>
              {error ? <ErrorLine>{error}</ErrorLine> : null}
              <button type="submit" className={primaryBtn} disabled={!fullName.trim() || !idNumber || !phone}>
                <KeyRound className="size-5" aria-hidden />
                המשך
              </button>
            </form>
          ) : step === "sign" ? (
            <form onSubmit={sign} className={cardCls} aria-label="חתימה">
              <div
                className="flex items-center justify-between gap-2.5 rounded-[14px] bg-shell px-4 py-3.5 text-white"
                style={{ backgroundImage: "radial-gradient(120% 140% at 100% 0%, rgba(31,95,208,.5), transparent 60%)" }}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs text-shell-text">שם העובד</span>
                  <span className="truncate text-lg font-extrabold">{fullName}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs text-shell-text">סה״כ לקבלה</span>
                  <span className="ds-num text-2xl font-semibold">{link.total.toLocaleString("he-IL")} ₪</span>
                </div>
              </div>
              <ClientOnly fallback={<div className="h-[186px] rounded-xl border-2 border-dashed border-[#9dbbef]" />}>
                <Suspense fallback={<div className="h-[186px] rounded-xl border-2 border-dashed border-[#9dbbef]" />}>
                  <SignatureField onChange={setHasSignature} onCapture={setSignature} />
                </Suspense>
              </ClientOnly>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-navy-900">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="m-0 size-5 shrink-0 accent-blue-500"
                />
                אני מאשר/ת קבלת שוברי דלק
              </label>
              {error ? <ErrorLine>{error}</ErrorLine> : null}
              <button type="submit" className={primaryBtn} disabled={!hasSignature || !consent}>
                <ShieldCheck className="size-5" aria-hidden />
                חתימה וקבלת הקודים
              </button>
              <p className="m-0 text-center text-xs text-slate-600">החתימה נשמרת בארכיון החתימות של רשף ביטחון לצורכי בקרה בלבד.</p>
            </form>
          ) : (
            <section className="flex flex-col gap-3" aria-label="הארנק הדיגיטלי">
              <div className="flex items-center gap-3 rounded-[14px] bg-available-bg px-3.5 py-3 text-available-fg">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-available text-white">
                  <CheckCircle2 className="size-5" aria-hidden />
                </span>
                <div className="flex flex-col gap-px">
                  <strong className="text-[14.5px]">הקודים זמינים</strong>
                  <span className="text-[12.5px]">הציגו את הקוד בתחנת הדלק בעת התדלוק.</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <p className="m-0 flex items-center gap-2 text-sm font-bold">
                  <Wallet className="size-4 text-blue-500" aria-hidden />
                  {codes.length} קודים פעילים · <span className="ds-num">{link.total.toLocaleString("he-IL")} ₪</span>
                </p>
                {petrolCount && dieselCount ? (
                  <p className="m-0 text-xs font-bold text-slate-600">
                    {petrolCount} בנזין <span className="mx-1">|</span> {dieselCount} סולר
                  </p>
                ) : null}
              </div>
              {codes.map((v) => (
                <WalletCodeCard key={v.serial} fuelType={v.fuelType} amount={v.amount} code={v.realCode} onCopy={() => copyCode(v.realCode)} />
              ))}
            </section>
          )}

          <p className="m-0 mt-auto flex items-center justify-center gap-1.5 pt-2 text-center text-xs text-slate-600">
            <ShieldCheck className="size-3.5" aria-hidden />
            הפרטים מאובטחים במערכת רשף ביטחון
          </p>
        </main>
      </div>
    </div>
  );
}
