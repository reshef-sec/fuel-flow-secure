import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FlaskConical, GraduationCap, Loader2, PauseCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button, Input, Label } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { useAuthContext } from "@/lib/auth-context";
import { useDevelopmentToolsAccess } from "@/lib/superAdmin";
import {
  getLearningStatus,
  isLearningResetConfirmed,
  LEARNING_RESET_CONFIRMATION,
  reloadForLearningMode,
  setLearningMode,
  type LearningStatus,
} from "@/lib/learning";

/**
 * סביבת לימוד — UI pieces. The server decides everything: `profile.learning_mode` is true only for the
 * system owner while active, and the switch itself only renders for the verified owner (fails closed).
 */

/** True while the signed-in owner works in the learning environment (never for anyone else). */
export function useLearningActive() {
  const { profile } = useAuthContext();
  return profile?.learning_mode === true;
}

type Busy = "activate" | "pause" | null;

/** Activate / pause, then a full reload so every store and page loads from the right data set. */
function useLearningToggle() {
  const [busy, setBusy] = useState<Busy>(null);
  const run = useCallback(async (action: "activate" | "pause") => {
    if (busy) return;
    setBusy(action);
    try {
      await setLearningMode(action);
      reloadForLearningMode();
      // Stay busy until the page unloads.
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הפעולה נכשלה");
      setBusy(null);
    }
  }, [busy]);
  return { busy, run };
}

function ActivateDialog({ open, busy, onClose, onConfirm }: { open: boolean; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      size="sm"
      title="הפעלת סביבת לימוד"
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={busy}>ביטול</Button>
          <Button variant="primary" loading={busy} onClick={onConfirm}>
            <GraduationCap className="size-4" aria-hidden />הפעלת סביבת הדמו
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-slate-600">
        <p className="m-0">
          במצב זה כל המסכים מציגים <strong className="text-navy-900">נתונים פיקטיביים</strong> ללימוד, תרגול והדגמות.
          אפשר לייבא, להקצות, להנפיק ולחתום בחופשיות.
        </p>
        <p className="m-0">שום פעולה בסביבת הלימוד אינה משפיעה על המערכת האמיתית, ושאר המשתמשים ממשיכים לעבוד כרגיל.</p>
        {busy ? (
          <p className="m-0 flex items-center gap-2 font-semibold text-navy-900" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            מכין את סביבת הדמו… בפעם הראשונה זה עשוי לקחת כמה שניות.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** Two-state switch (role="switch"); the parent decides what happens on change. */
function SwitchControl({ on, busy, tone, onToggle }: { on: boolean; busy: boolean; tone: "light" | "dark"; onToggle: () => void }) {
  const stateText = busy ? (on ? "משהה…" : "מכין סביבת דמו…") : on ? "סביבת דמו פעילה" : "סביבת דמו מושהית";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="סביבת לימוד"
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold outline-none transition focus-visible:shadow-focus-mint disabled:cursor-wait",
        tone === "dark"
          ? "border-white/15 bg-white/[.06] text-shell-text hover:bg-white/[.12]"
          : "border-slate-200 bg-white text-ink-soft hover:border-slate-300",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-[20px] w-[36px] shrink-0 items-center rounded-full p-[2px] transition-colors",
          on ? "justify-end bg-mint-500" : tone === "dark" ? "justify-start bg-white/25" : "justify-start bg-slate-300",
        )}
      >
        <span className="grid size-4 place-items-center rounded-full bg-white shadow-sm">
          {busy ? <Loader2 className="size-3 animate-spin text-navy-900" /> : null}
        </span>
      </span>
      <span className="whitespace-nowrap">{stateText}</span>
    </button>
  );
}

/**
 * Owner-only "סביבת לימוד" switch for the app shell (breadcrumb bar / mobile drawer).
 * Hidden while the server check loads, on error, and for every other user.
 */
export function LearningSwitch({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const allowed = useDevelopmentToolsAccess();
  const active = useLearningActive();
  const { busy, run } = useLearningToggle();
  const [confirming, setConfirming] = useState(false);
  if (!allowed) return null;

  const toggle = () => (active ? void run("pause") : setConfirming(true));
  return (
    <div data-learning-ui className={cn("flex items-center gap-2", className)}>
      <span className={cn("flex items-center gap-1.5 whitespace-nowrap text-xs font-bold", tone === "dark" ? "text-white" : "text-navy-900")}>
        <GraduationCap className="size-4" aria-hidden />
        סביבת לימוד
      </span>
      <SwitchControl on={active} busy={busy !== null} tone={tone} onToggle={toggle} />
      {/* Portaled: the mobile drawer is a transformed, scrolling container. */}
      {confirming && typeof document !== "undefined"
        ? createPortal(
            <div dir="rtl"><ActivateDialog open busy={busy === "activate"} onClose={() => setConfirming(false)} onConfirm={() => void run("activate")} /></div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Persistent stripe at the top of every internal page while the learning environment is active. */
export function LearningBanner() {
  const active = useLearningActive();
  const { busy, run } = useLearningToggle();
  if (!active) return null;
  return (
    <div data-learning-ui
      role="status"
      className="flex items-center justify-center gap-x-3 gap-y-1.5 border-b border-[#f0d48a] px-3.5 py-2 text-[13px] text-amber-700 max-[899.98px]:flex-wrap min-[900px]:px-8"
      style={{ background: "linear-gradient(90deg, #fff4d9 0%, #fff8e6 55%, #e6faf5 100%)" }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <GraduationCap className="size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-extrabold">סביבת לימוד פעילה</strong>
          <span className="mx-1.5" aria-hidden>·</span>
          כל הנתונים במסך הם נתוני דמו ואינם משפיעים על המערכת
        </span>
      </span>
      <button
        type="button"
        onClick={() => void run("pause")}
        disabled={busy !== null}
        className="inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#e3c26b] bg-white/80 px-2.5 text-xs font-bold text-amber-700 outline-none hover:bg-white focus-visible:shadow-focus-mint disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <PauseCircle className="size-3.5" aria-hidden />}
        {busy ? "משהה…" : "השהיה"}
      </button>
    </div>
  );
}

/** Small "דמו" chip shown next to the logo while the learning environment is active. */
export function DemoChip({ className }: { className?: string }) {
  const active = useLearningActive();
  if (!active) return null;
  return (
    <span data-learning-ui
      className={cn(
        "inline-flex items-center rounded-pill bg-pending px-2 py-[2px] text-[11px] font-extrabold leading-4 tracking-wide text-navy-900 shadow-sm",
        className,
      )}
    >
      דמו
    </span>
  );
}

const COUNT_LABELS: { key: keyof LearningStatus["counts"]; label: string }[] = [
  { key: "vouchers", label: "שוברים" },
  { key: "links", label: "לינקים לעובדים" },
  { key: "requests", label: "בקשות" },
  { key: "users", label: "משתמשים" },
];

/** Settings → כלי פיתוח: status, counts, activate/pause and a typed-confirmation reset of the demo data. */
export function LearningCard() {
  const allowed = useDevelopmentToolsAccess();
  const active = useLearningActive();
  const { busy, run } = useLearningToggle();
  const [status, setStatus] = useState<LearningStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getLearningStatus()
      .then((s) => { if (!cancelled) { setStatus(s); setLoadError(null); } })
      .catch((e: unknown) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "טעינת המצב נכשלה"); });
    return () => { cancelled = true; };
  }, [allowed]);

  if (!allowed) return null;

  const closeReset = () => { if (!resetting) { setResetOpen(false); setConfirmation(""); } };
  const reset = async () => {
    if (resetting || !isLearningResetConfirmed(confirmation)) return;
    setResetting(true);
    try {
      const next = await setLearningMode("reset");
      toast.success("נתוני הדמו אופסו ונטענו מחדש");
      if (active) {
        reloadForLearningMode();
        return;
      }
      setStatus(next);
      setResetOpen(false);
      setConfirmation("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "האיפוס נכשל");
    }
    setResetting(false);
  };

  return (
    <article className="ds-card flex flex-col gap-4 px-[18px] py-4" aria-labelledby="learning-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id="learning-title" className="m-0 flex items-center gap-2 text-base font-extrabold text-navy-900">
            <GraduationCap className="size-5" aria-hidden />
            סביבת לימוד
          </h3>
          <span className="text-[13px] text-slate-600">
            עותק נפרד עם נתונים פיקטיביים ללימוד והדגמות. אינו משפיע על המערכת האמיתית ועל שאר המשתמשים.
          </span>
        </div>
        <SwitchControl on={active} busy={busy !== null} tone="light" onToggle={() => (active ? void run("pause") : setConfirming(true))} />
      </div>

      {loadError ? (
        <p className="m-0 text-[13px] font-semibold text-redeemed-fg" role="alert">{loadError}</p>
      ) : (
        <dl className="m-0 grid grid-cols-2 gap-2.5 min-[600px]:grid-cols-4" aria-busy={!status || undefined}>
          {COUNT_LABELS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-0.5 rounded-xl border border-line bg-table-head px-3 py-2.5">
              <dt className="text-xs text-slate-600">{label}</dt>
              <dd className="ds-num m-0 text-lg font-semibold text-navy-900">{status ? status.counts[key].toLocaleString("he-IL") : "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      {status && !status.seeded ? (
        <p className="m-0 flex items-center gap-2 text-[13px] text-slate-600">
          <FlaskConical className="size-4" aria-hidden />
          נתוני הדמו ייטענו בהפעלה הראשונה (עשוי לקחת כמה שניות).
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end border-t border-line pt-3">
        <button type="button" className="ds-btn ds-btn-light max-[899.98px]:w-full" onClick={() => setResetOpen(true)} disabled={busy !== null || resetting}>
          <RotateCcw className="size-4" aria-hidden />איפוס נתוני הדמו
        </button>
      </div>

      <ActivateDialog open={confirming} busy={busy === "activate"} onClose={() => setConfirming(false)} onConfirm={() => void run("activate")} />
      <Modal open={resetOpen} onClose={closeReset} title="איפוס נתוני הדמו">
        <p className="m-0 flex items-start gap-2 font-semibold text-navy-900">
          <TriangleAlert className="size-5 shrink-0 text-pending" aria-hidden />
          כל מה שנעשה בסביבת הלימוד יימחק, ונתוני הדמו ייטענו מחדש מההתחלה.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">הפעולה נוגעת לסביבת הלימוד בלבד. נתוני המערכת האמיתית אינם מושפעים.</p>
        <Label htmlFor="learning-reset-confirmation" className="mt-5 block">להמשך, הקלידו: {LEARNING_RESET_CONFIRMATION}</Label>
        <Input
          id="learning-reset-confirmation"
          className="mt-2"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={resetting}
          autoComplete="off"
        />
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={closeReset} disabled={resetting}>ביטול</Button>
          <Button variant="primary" loading={resetting} disabled={!isLearningResetConfirmed(confirmation)} onClick={() => void reset()}>
            <RotateCcw className="size-4" aria-hidden />איפוס וטעינה מחדש
          </Button>
        </div>
      </Modal>
    </article>
  );
}
