import type { ReactNode } from "react";
import { Logo } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

/**
 * AuthLayout — immersive full-screen navy stage for /login and /change-password.
 * Decorative layers (glows, fine grid, slowly turning ring emblem) sit behind a two-column
 * composition: the white wordmark + "מערכת ניהול שוברי דלק" headline, and the floating form card.
 * Under 900px it stacks: logo on top, card below. All motion respects prefers-reduced-motion.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="auth-stage relative isolate min-h-screen overflow-hidden font-sans text-white">
      {/* Decorative background — hidden from assistive tech */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="auth-grid absolute inset-0" />
        <div className="auth-orb auth-orb-blue" />
        <div className="auth-orb auth-orb-mint" />
        <div className="auth-orb auth-orb-indigo" />
        <Logo variant="emblem-reversed" alt="" className="auth-ring" />
        <div className="auth-vignette absolute inset-0" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[1240px] flex-col items-center justify-center gap-8 px-4 py-8 min-[900px]:flex-row min-[900px]:justify-between min-[900px]:gap-16 min-[900px]:px-12 min-[900px]:py-12">
        <section aria-label="רשף ביטחון" className="auth-rise flex flex-col items-center text-center min-[900px]:max-w-[540px] min-[900px]:items-start min-[900px]:text-right">
          <Logo variant="reversed" alt="רשף ביטחון" className="h-[84px] drop-shadow-[0_10px_30px_rgba(0,0,0,.35)] min-[900px]:h-[170px]" />
          <h2 className="m-0 mt-5 hidden text-[60px] font-extrabold leading-[1.06] tracking-[-.02em] text-white min-[900px]:block">
            מערכת ניהול
            <br />
            <span className="auth-headline-accent">שוברי דלק</span>
          </h2>
          <p className="m-0 mt-2 text-[15px] font-bold tracking-[.04em] text-shell-text min-[900px]:hidden">מערכת ניהול שוברי דלק</p>
          <span aria-hidden className="mt-6 hidden h-[5px] w-24 rounded-pill bg-gradient-to-l from-mint-500 to-blue-500 min-[900px]:block" />
        </section>

        <main className="flex w-full flex-col items-center gap-5 min-[900px]:w-auto">
          {children}
          <p className="m-0 flex items-center gap-2 text-[12.5px] text-shell-muted">
            <Logo variant="emblem-reversed" alt="" aria-hidden className="h-[16px] opacity-80" />
            רשף ביטחון · כניסה מאובטחת
          </p>
        </main>
      </div>
    </div>
  );
}

/** AuthCard — the floating white form card used inside AuthLayout. */
export function AuthCard({ children, className, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      className={cn(
        "auth-card auth-rise-late relative flex w-full max-w-[440px] flex-col gap-[18px] overflow-hidden rounded-[22px] bg-white px-5 pb-6 pt-7 text-navy-900 min-[900px]:w-[440px] min-[900px]:px-9 min-[900px]:pb-9 min-[900px]:pt-10",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[5px] bg-gradient-to-l from-mint-500 via-blue-500 to-navy-700" />
      {children}
    </form>
  );
}

/** AuthAlert — compact inline message inside the auth card. */
export function AuthAlert({
  tone,
  title,
  children,
  icon,
}: {
  tone: "error" | "warning" | "info";
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const cls =
    tone === "error"
      ? "bg-redeemed-bg text-redeemed-fg"
      : tone === "warning"
        ? "border border-[#f3dc9c] bg-pending-bg text-[#6e4700]"
        : "bg-waiting-bg text-waiting-fg";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl px-3.5 py-3 text-[13.5px] leading-normal", cls)}>
      {icon ? <span className="mt-px shrink-0">{icon}</span> : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <strong>{title}</strong> : null}
        {children ? <span>{children}</span> : null}
      </div>
    </div>
  );
}

/** Input with a leading icon, 50px tall (auth pages). */
export const authInputClass =
  "h-[50px] w-full rounded-[13px] border border-line-strong bg-slate-50 pl-3.5 pr-[44px] text-right text-[15px] text-navy-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-mint-500 focus:bg-white focus:shadow-focus-mint aria-[invalid=true]:border-redeemed aria-[invalid=true]:bg-[#fffafa]";
