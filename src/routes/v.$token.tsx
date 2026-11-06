import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AlertCircle, CalendarX2, CheckCircle2, FlaskConical, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { getWorkerLinkStatus, openWorkerWallet, requestWorkerOtp, revealWorkerCode, signWorkerLink, verifyWorkerOtp } from "@/lib/backend";
import { isDemoSearchValue } from "@/lib/publicUrl";
import { readVoucherCache, writeVoucherCache, type CachedCode, type VoucherCache } from "@/lib/voucherCache";
import { StepIndicator } from "@/components/worker/StepIndicator";
import { VoucherExport } from "@/components/worker/VoucherExport";
import { WalletCodeCard } from "@/components/worker/WalletCodeCard";

const SignatureField = lazy(() => import("@/components/worker/SignatureField"));

type Step = "otp" | "sign" | "wallet";

export const Route = createFileRoute("/v/$token")({
  head: () => ({
    meta: [
      { title: "ארנק שוברי דלק | רשף ביטחון" },
      { name: "description", content: "לינק אישי לקבלת שוברי דלק: קוד אימות, חתימה והצגת הקודים." },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  // ?demo=1 → a learning-environment (סביבת לימוד) link: read from the demo copy.
  validateSearch: (search: Record<string, unknown>): { demo?: 1 } => (isDemoSearchValue(search.demo) ? { demo: 1 } : {}),
  component: VoucherWallet,
});

const STEP_NAMES = ["אימות", "חתימה", "ארנק"] as const;
const STEP_KEYS: Step[] = ["otp", "sign", "wallet"];
const cardCls = "flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-[18px] shadow-card";
const primaryBtn = "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[13px] border-0 bg-blue-500 text-[15.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";

function StateCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className={cn(cardCls, "items-center py-8 text-center")} role="alert">
      <span className="grid size-[72px] place-items-center rounded-full bg-pending-bg text-amber-700">{icon}</span>
      <strong className="text-lg">{title}</strong>
      <p className="m-0 text-sm text-slate-600">{children}</p>
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
  const { token } = Route.useParams();
  const demo = Route.useSearch({ select: (s) => s.demo === 1 });
  const demoArg = demo ? { demo: true } : {};

  const [ready, setReady] = useState(false);
  const [link, setLink] = useState<{ total: number; signed: boolean; name: string; reachable: boolean } | null>(null);
  const [expired, setExpired] = useState(false);
  const [wallet, setWallet] = useState<VoucherCache | null>(null);
  const [session, setSession] = useState("");
  const [step, setStep] = useState<Step>("otp");
  const [otp, setOtp] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsNewCode, setNeedsNewCode] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // A repeat visit on this device opens from local storage, with no server call and no SMS.
    const cached = readVoucherCache(token);
    if (cached) {
      setWallet(cached);
      setStep("wallet");
      setReady(true);
      return;
    }
    getWorkerLinkStatus({ data: { id: token, ...demoArg } })
      .then((r) => {
        if (r.exists && r.state === "expired") setExpired(true);
        setLink(r.exists ? { total: r.total, signed: r.signed, name: r.employeeName, reachable: r.reachable } : null);
      })
      .catch(() => setLink(null))
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, demo]);

  function keep(next: VoucherCache) {
    setWallet(next);
    writeVoucherCache(token, next);
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(otp)) return setError("יש להזין קוד בן 4 ספרות");
    setBusy(true);
    setError(null);
    try {
      const r = await verifyWorkerOtp({ data: { id: token, code: otp, ...demoArg } });
      if (!r.ok) {
        setOtp("");
        if (r.state === "expired") return setExpired(true);
        if (r.state === "new_code_needed") {
          setNeedsNewCode(true);
          return setError("הקוד אינו בתוקף יותר. אפשר לבקש קוד חדש");
        }
        return setError(`קוד שגוי · נותרו ${r.attemptsLeft} ניסיונות`);
      }
      setSession(r.session);
      if (!r.signed) return setStep("sign");
      const opened = await openWorkerWallet({ data: { id: token, session: r.session, ...demoArg } });
      if (!opened.ok) return setError("לא ניתן לפתוח את הארנק כרגע. נסו שוב");
      keep({
        session: r.session, employeeName: link?.name ?? "", total: link?.total ?? 0, signature: null,
        signedAt: new Date().toISOString(), codes: opened.codes,
      });
      setStep("wallet");
    } catch {
      setError("האימות נכשל. נסו שוב");
    } finally {
      setBusy(false);
    }
  }

  async function askNewCode() {
    setError(null);
    const r = await requestWorkerOtp({ data: { id: token } }).catch(() => null);
    if (r?.ok) {
      setNeedsNewCode(false);
      toast.success("קוד חדש נשלח ב־SMS");
    } else if (r?.state === "wait") setError("אפשר לבקש קוד חדש פעם בדקה");
    else setError("לא ניתן לשלוח קוד כרגע. יש לפנות למי שהפיק את השובר");
  }

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    if (!hasSignature || !signature || !consent) return setError("נדרשת חתימה ואישור קבלה");
    setBusy(true);
    try {
      const r = await signWorkerLink({ data: { id: token, session, signature, ...demoArg } });
      if (!r.ok) return setError("לא ניתן לחתום על הלינק");
      keep({
        session, employeeName: link?.name ?? "", total: link?.total ?? 0, signature,
        signedAt: new Date().toISOString(), codes: r.codes,
      });
      setError(null);
      setStep("wallet");
      toast.success("החתימה נשמרה");
    } finally {
      setBusy(false);
    }
  }

  async function reveal(serial: string) {
    if (!wallet) return;
    const r = await revealWorkerCode({ data: { id: token, session: wallet.session, serial, ...demoArg } }).catch(() => null);
    const code = r?.ok ? r.code : null;
    if (!code) return void toast.error("לא ניתן לחשוף את הקוד כרגע. נסו שוב");
    keep({ ...wallet, codes: wallet.codes.map((c) => (c.serial === serial ? (code as CachedCode) : c)) });
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

  const codes = wallet?.codes ?? [];
  const total = wallet?.total ?? link?.total ?? 0;
  const name = wallet?.employeeName ?? link?.name ?? "";

  return (
    <div dir="rtl" className="min-h-screen bg-page font-sans text-navy-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        <header className="flex flex-col items-center gap-3 border-b border-line bg-white px-[18px] pb-4 pt-[18px]">
          <Logo variant="color" className="h-[84px]" />
          {demo ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-[#f0d48a] bg-pending-bg px-2.5 py-[3px] text-xs font-bold text-amber-700">
              <FlaskConical className="size-3.5" aria-hidden />
              קישור דמו
            </span>
          ) : null}
          <div className="w-full rounded-xl bg-available-bg px-3.5 py-2.5 text-center">
            <h1 className="m-0 text-lg font-extrabold text-navy-900">{step === "wallet" ? "הארנק הדיגיטלי שלי" : "קבלת שוברי דלק"}</h1>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-3.5 px-4 pb-6 pt-4">
          {ready && (wallet || (link && !expired)) ? <StepIndicator steps={STEP_NAMES} current={STEP_KEYS.indexOf(step)} /> : null}

          {!ready ? (
            <p className="py-10 text-center text-sm text-slate-600" aria-busy="true">טוען…</p>
          ) : step === "wallet" && wallet ? (
            <section className="flex flex-col gap-3" aria-label="הארנק הדיגיטלי">
              <div className="flex items-center gap-3 rounded-[14px] bg-available-bg px-3.5 py-3 text-available-fg">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-available text-white">
                  <CheckCircle2 className="size-5" aria-hidden />
                </span>
                <div className="flex flex-col gap-px">
                  <strong className="text-[14.5px]">הקודים זמינים</strong>
                  <span className="text-[12.5px]">לחצו על קוד כדי לחשוף אותו בתחנת הדלק. קוד שנחשף נשאר גלוי.</span>
                </div>
              </div>
              <p className="m-0 flex items-center gap-2 px-0.5 text-sm font-bold">
                <Wallet className="size-4 text-blue-500" aria-hidden />
                {codes.length} קודים · <span className="ds-num">{total.toLocaleString("he-IL")} ₪</span>
              </p>
              {codes.map((v) => (
                <WalletCodeCard key={v.serial} fuelType={v.fuelType} amount={v.amount} code={v.revealed ? v.realCode : null} onReveal={() => reveal(v.serial)} onCopy={() => copyCode(v.realCode)} />
              ))}
              <VoucherExport name={name} total={total} codes={codes} />
            </section>
          ) : expired ? (
            <StateCard icon={<CalendarX2 className="size-8" aria-hidden />} title="פג תוקף הלינק">
              הלינק היה בתוקף 3 חודשים מיום ההפקה. יש לפנות למי שהפיק את השובר.
            </StateCard>
          ) : !link ? (
            <StateCard icon={<AlertCircle className="size-8" aria-hidden />} title="הלינק אינו תקף">
              יש לפנות למי שהפיק את השובר.
            </StateCard>
          ) : step === "otp" ? (
            <form onSubmit={checkCode} className={cardCls} aria-label="אימות" noValidate>
              <div className="rounded-xl border border-line bg-table-head px-3.5 py-3 text-center">
                <p className="m-0 text-xs text-slate-600">שם העובד</p>
                <p className="m-0 text-[19px] font-extrabold text-navy-700">{link.name}</p>
                <p className="m-0 text-sm text-slate-600">סה״כ <span className="ds-num font-semibold">{link.total.toLocaleString("he-IL")} ₪</span></p>
              </div>
              <label className="flex flex-col gap-[7px] text-sm font-bold">
                קוד אימות מה־SMS
                <input
                  aria-label="קוד אימות"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  placeholder="4 ספרות"
                  className="ds-num h-14 rounded-control border border-line-strong bg-white text-center text-2xl tracking-[.4em] outline-none focus:shadow-focus-mint"
                />
              </label>
              {error ? <ErrorLine>{error}</ErrorLine> : null}
              <button type="submit" className={primaryBtn} disabled={otp.length !== 4 || busy}>
                <KeyRound className="size-5" aria-hidden />
                המשך
              </button>
              {link.reachable && !demo ? (
                <button type="button" className={cn("cursor-pointer border-0 bg-transparent p-1 text-[13px] font-semibold text-blue-500", needsNewCode && "font-extrabold")} onClick={() => void askNewCode()}>
                  לא קיבלתי קוד, שלחו קוד חדש
                </button>
              ) : null}
            </form>
          ) : (
            <form onSubmit={sign} className={cardCls} aria-label="חתימה">
              <div className="flex items-center justify-between gap-2.5 rounded-[14px] bg-shell px-4 py-3.5 text-white">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs text-shell-text">שם העובד</span>
                  <span className="truncate text-lg font-extrabold">{link.name}</span>
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
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="m-0 size-5 shrink-0 accent-blue-500" />
                אני מאשר/ת קבלת שוברי דלק
              </label>
              {error ? <ErrorLine>{error}</ErrorLine> : null}
              <button type="submit" className={primaryBtn} disabled={!hasSignature || !consent || busy}>
                חתימה וקבלת הקודים
              </button>
            </form>
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
