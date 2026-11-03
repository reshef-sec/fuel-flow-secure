import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useAuthContext } from "@/lib/auth-context";
import { changePassword, signOut } from "@/lib/useAuth";
import { passwordPolicyError } from "@/lib/passwordPolicy";
import { userDisplayName } from "@/lib/userDisplay";
import { AuthAlert, AuthCard, AuthLayout, authInputClass } from "@/components/layout/AuthLayout";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

export const Route = createFileRoute("/change-password")({
  head: () => ({
    meta: [
      { title: "עדכון סיסמה | רשף ביטחון" },
      { name: "description", content: "עדכון סיסמה ראשונית לפני כניסה למערכת שוברי הדלק." },
      { property: "og:title", content: "עדכון סיסמה | רשף ביטחון" },
      { property: "og:description", content: "בחירת סיסמה חדשה ומאובטחת." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { refresh, session, profile } = useAuthContext();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const policyError = passwordPolicyError(pw, profile);
    if (policyError) return setError(policyError);
    if (pw !== confirm) return setError("הסיסמאות אינן תואמות");
    setError(null);
    setBusy(true);
    try {
      await changePassword(pw);
      toast.success("הסיסמה עודכנה בהצלחה");
      await refresh();
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון הסיסמה נכשל");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;

  // Live checklist — display only; submit still runs passwordPolicyError() and the server re-checks.
  const checks = [
    { label: "לפחות 8 תווים", ok: pw.length >= 8 },
    { label: "אותיות וספרות", ok: /[A-Za-zא-ת]/.test(pw) && /\d/.test(pw) },
    { label: "לא ת.ז או מספר הנייד", ok: pw.length > 0 && !(profile && (pw === profile.national_id || pw === profile.phone)) },
    { label: "הסיסמאות תואמות", ok: confirm.length > 0 && confirm === pw },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const iconCls = "pointer-events-none absolute right-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400";

  return (
    <AuthLayout>
      <AuthCard onSubmit={onSubmit} noValidate aria-labelledby="cp-title">
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="mb-2 grid size-12 place-items-center rounded-[14px] bg-gradient-to-br from-blue-500 to-navy-700 text-white shadow-[0_8px_20px_rgba(31,95,208,.35)]">
            <KeyRound className="size-[22px]" />
          </span>
          <h1 id="cp-title" className="m-0 text-[26px] font-extrabold tracking-[-.01em]">עדכון סיסמה</h1>
          <p className="m-0 text-sm text-slate-600">יש לבחור סיסמה חדשה לפני הכניסה למערכת.</p>
          {profile ? (
            <p className="m-0 text-sm text-slate-600">
              מחובר/ת כ: <strong className="text-navy-900">{userDisplayName(profile)}</strong>
              {profile.phone ? (
                <>
                  {" · "}
                  <span className="ds-num" dir="ltr">{profile.phone}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <label className="flex flex-col gap-[7px] text-[13.5px] font-semibold text-ink-soft">
          סיסמה חדשה
          <span className="relative block">
            <Lock className={iconCls} aria-hidden />
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              dir="ltr"
              aria-label="סיסמה חדשה"
              className={cn(authInputClass, "pl-12")}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
              aria-pressed={show}
              className="absolute left-0.5 top-0.5 grid size-11 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-slate-600 focus-visible:shadow-focus-mint focus-visible:outline-none"
            >
              {show ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
            </button>
          </span>
        </label>

        <label className="flex flex-col gap-[7px] text-[13.5px] font-semibold text-ink-soft">
          אימות סיסמה
          <span className="relative block">
            <ShieldCheck className={iconCls} aria-hidden />
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              dir="ltr"
              aria-label="אימות סיסמה"
              aria-invalid={confirm.length > 0 && confirm !== pw ? true : undefined}
              className={authInputClass}
            />
          </span>
        </label>

        <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-table-head px-4 py-3.5" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-bold">דרישות הסיסמה</span>
            <span className="text-[12.5px] text-slate-600">
              <span className="ds-num font-semibold text-navy-900">{passed}/4</span> תנאים
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-pill bg-[#e3e8f0]">
            <div
              className={cn("h-full rounded-pill transition-[width]", passed === 4 ? "bg-available" : "bg-blue-500")}
              style={{ width: `${(passed / 4) * 100}%` }}
            />
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2.5 text-[13.5px]">
                <span
                  aria-hidden
                  className={cn("grid size-5 shrink-0 place-items-center rounded-full", c.ok ? "bg-available text-white" : "bg-[#e3e8f0] text-[#b1bccd]")}
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className={c.ok ? "font-semibold text-available-fg" : "text-slate-600"}>{c.label}</span>
                <span className="sr-only">{c.ok ? "(מתקיים)" : "(לא מתקיים)"}</span>
              </li>
            ))}
          </ul>
        </div>

        {error ? (
          <AuthAlert tone="error" icon={<AlertCircle className="size-[18px]" aria-hidden />}>
            {error}
          </AuthAlert>
        ) : null}

        <button type="submit" disabled={busy} aria-busy={busy || undefined} className="auth-btn mt-1 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[13px] border-0 text-[15.5px] font-bold disabled:cursor-not-allowed disabled:opacity-60 focus-visible:shadow-focus-mint focus-visible:outline-none">
          {busy ? "שומר…" : "שמור סיסמה"}
          {busy ? null : <ArrowLeft className="size-[18px]" aria-hidden />}
        </button>

        <div className="flex justify-center border-t border-table-line pt-3 text-[13.5px]">
          <button
            type="button"
            onClick={() => void signOut().then(() => navigate({ to: "/login", replace: true }))}
            className="cursor-pointer rounded-lg border-0 bg-transparent px-1 py-2.5 font-semibold text-blue-500 hover:text-blue-700 focus-visible:shadow-focus-mint focus-visible:outline-none"
          >
            יציאה וחזרה למסך הכניסה
          </button>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
