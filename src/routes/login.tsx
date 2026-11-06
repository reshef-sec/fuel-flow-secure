import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, ArrowLeft, Eye, EyeOff, Info, Lock, LogIn, Mail, User } from "lucide-react";
import { toast } from "sonner";

import { bootstrapAdmin, getAuthOptions, getSetupStatus } from "@/lib/backend";
import { signIn } from "@/lib/useAuth";
import { AuthAlert, AuthCard, AuthLayout, authInputClass } from "@/components/layout/AuthLayout";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "כניסה למערכת | רשף ביטחון" },
      { name: "description", content: "כניסה מאובטחת למערכת ניהול שוברי הדלק של רשף ביטחון." },
      { property: "og:title", content: "כניסה למערכת | רשף ביטחון" },
      { property: "og:description", content: "כניסה מאובטחת עם חשבון Microsoft או אימייל וסיסמה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

/** Why Microsoft sent the user back here (/login?error=…). */
const MICROSOFT_ERRORS: Record<string, string> = {
  not_authorized: "כתובת המייל אינה מורשית במערכת",
  microsoft_failed: "הכניסה דרך Microsoft נכשלה. נסו שוב",
};

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-[18px]" aria-hidden>
      <path fill="#f25022" d="M1 1h9v9H1z" />
      <path fill="#7fba00" d="M11 1h9v9h-9z" />
      <path fill="#00a4ef" d="M1 11h9v9H1z" />
      <path fill="#ffb900" d="M11 11h9v9h-9z" />
    </svg>
  );
}

function LoginPage() {
  const status = getSetupStatus;
  const bootstrap = bootstrapAdmin;
  const [needsSetup, setNeedsSetup] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [microsoft, setMicrosoft] = useState(false);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    status().then((r) => setNeedsSetup(r.needsSetup)).catch(() => undefined);
    getAuthOptions().then((r) => setMicrosoft(r.microsoft)).catch(() => undefined);
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason && MICROSOFT_ERRORS[reason]) setError(MICROSOFT_ERRORS[reason]);
  }, [status]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError("יש למלא אימייל וסיסמה");
      return;
    }
    setBusy(true);
    try {
      if (needsSetup) {
        await bootstrap({ data: { email: identifier, password, fullName } });
        toast.success("חשבון מנהל ראשי נוצר");
      }
      // The server sets the httpOnly session cookie and records "כניסה למערכת" in the activity log.
      await signIn(identifier, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הכניסה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  const iconCls = "pointer-events-none absolute right-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400";

  return (
    <AuthLayout>
      <AuthCard onSubmit={onSubmit} noValidate aria-labelledby="login-title">
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="mb-2 grid size-12 place-items-center rounded-[14px] bg-gradient-to-br from-blue-500 to-navy-700 text-white shadow-[0_8px_20px_rgba(31,95,208,.35)]">
            <LogIn className="size-[22px]" />
          </span>
          {needsSetup ? null : <span className="text-[13px] font-bold tracking-[.06em] text-teal-600">ברוכים הבאים</span>}
          <h1 id="login-title" className="m-0 text-[28px] font-extrabold tracking-[-.015em]">
            {needsSetup ? "הגדרת מנהל ראשי" : "כניסה למערכת"}
          </h1>
          <p className="m-0 text-[14.5px] text-slate-600">
            {needsSetup ? "המערכת טרם הוגדרה. צרו את חשבון המנהל הראשי כדי להתחיל." : "התחברו עם חשבון Microsoft, או עם אימייל וסיסמה."}
          </p>
        </div>

        {microsoft && !needsSetup ? (
          <>
            <a
              href="/api/auth/microsoft/start"
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[13px] border border-line-strong bg-white text-[15px] font-bold text-navy-900 no-underline transition hover:bg-slate-50 focus-visible:shadow-focus-mint focus-visible:outline-none"
            >
              <MicrosoftLogo />
              התחבר באמצעות Microsoft
            </a>
            <div className="flex items-center gap-3 text-xs text-slate-500" aria-hidden>
              <span className="h-px flex-1 bg-table-line" />
              או
              <span className="h-px flex-1 bg-table-line" />
            </div>
          </>
        ) : null}

        {needsSetup ? (
          <>
            <AuthAlert tone="info" title="התקנה ראשונה" icon={<Info className="size-[18px]" aria-hidden />}>
              החשבון הראשון שנוצר יקבל הרשאת אדמין מרכזי.
            </AuthAlert>
            <label className="flex flex-col gap-[7px] text-[13.5px] font-semibold text-ink-soft">
              שם מלא
              <span className="relative block">
                <User className={iconCls} aria-hidden />
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="שם פרטי ומשפחה"
                  className={authInputClass}
                />
              </span>
            </label>
          </>
        ) : null}

        <label className="flex flex-col gap-[7px] text-[13.5px] font-semibold text-ink-soft">
          {needsSetup ? "אימייל" : "אימייל או מספר נייד"}
          <span className="relative block">
            <Mail className={iconCls} aria-hidden />
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              inputMode="email"
              autoComplete="username"
              dir="ltr"
              placeholder="name@company.com"
              aria-label={needsSetup ? "אימייל" : "אימייל או מספר נייד"}
              aria-invalid={error ? true : undefined}
              className={authInputClass}
            />
          </span>
        </label>

        <label className="flex flex-col gap-[7px] text-[13.5px] font-semibold text-ink-soft">
          סיסמה
          <span className="relative block">
            <Lock className={iconCls} aria-hidden />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
              aria-label="סיסמה"
              aria-invalid={error ? true : undefined}
              className={`${authInputClass} pl-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "הסתרת סיסמה" : "הצגת סיסמה"}
              aria-pressed={showPassword}
              className="absolute left-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-[10px] text-slate-400 transition hover:bg-slate-100 hover:text-navy-700 focus-visible:shadow-focus-mint focus-visible:outline-none"
            >
              {showPassword ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
            </button>
          </span>
        </label>

        {error ? (
          <AuthAlert tone="error" icon={<AlertCircle className="size-[18px]" aria-hidden />}>
            {error}
          </AuthAlert>
        ) : null}

        <button type="submit" disabled={busy} aria-busy={busy || undefined} className="auth-btn mt-1 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[13px] border-0 text-[15.5px] font-bold disabled:cursor-wait disabled:opacity-70 focus-visible:shadow-focus-mint focus-visible:outline-none">
          {busy ? "מתחבר…" : needsSetup ? "צור מנהל והתחבר" : "כניסה למערכת"}
          {busy ? null : <ArrowLeft className="size-[18px]" aria-hidden />}
        </button>

      </AuthCard>
    </AuthLayout>
  );
}
