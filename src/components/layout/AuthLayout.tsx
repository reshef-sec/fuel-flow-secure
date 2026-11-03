import type { ReactNode } from "react";
import { Logo } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

/**
 * AuthLayout — split screen for /login and /change-password (design: Login.dc.html).
 * Navy brand panel with ONLY the white logo, the big white "מערכת ניהול שוברי דלק" and a mint accent line;
 * the form card sits on the light side. Under 900px the brand panel collapses to a logo band and the card overlaps it.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="flex min-h-screen flex-wrap items-stretch bg-page font-sans text-navy-900">
      <section
        aria-label="רשף ביטחון"
        className="relative flex flex-[1_1_100%] items-center justify-center overflow-hidden bg-shell px-5 pb-[46px] pt-[22px] text-white min-[900px]:flex-[1_1_460px] min-[900px]:flex-col min-[900px]:items-start min-[900px]:justify-between min-[900px]:gap-9 min-[900px]:px-14 min-[900px]:py-11"
        style={{
          backgroundImage:
            "radial-gradient(90% 70% at 100% 0%, rgba(31,95,208,.55), transparent 60%), radial-gradient(70% 60% at 0% 100%, rgba(69,205,186,.20), transparent 60%)",
        }}
      >
        <Logo
          variant="emblem-reversed"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -bottom-[110px] -left-[90px] h-[300px] opacity-[.12] min-[900px]:-bottom-[120px] min-[900px]:-left-[140px] min-[900px]:h-[560px]"
        />
        <Logo variant="reversed" alt="רשף ביטחון" className="relative h-[76px] min-[900px]:h-[150px]" />
        <div className="relative hidden max-w-[520px] min-[900px]:block">
          <p className="m-0 text-[52px] font-extrabold leading-[1.12] tracking-[-.015em] text-white">
            מערכת ניהול
            <br />
            שוברי דלק
          </p>
          <span aria-hidden className="mt-[22px] block h-1 w-[72px] rounded-pill bg-mint-500" />
        </div>
        <div aria-hidden className="hidden h-px min-[900px]:block" />
      </section>

      <main className="relative flex flex-[1_1_100%] flex-col items-center justify-start gap-[18px] px-3.5 pb-7 min-[900px]:flex-[1_1_460px] min-[900px]:justify-center min-[900px]:px-6 min-[900px]:py-10">
        {children}
        <div className="flex items-center gap-2 text-[12.5px] text-slate-400">
          <Logo variant="emblem" alt="" aria-hidden className="h-[18px] opacity-80" />
          <span>רשף ביטחון · מערכת ניהול שוברי דלק</span>
        </div>
      </main>
    </div>
  );
}

/** AuthCard — the white form card used inside AuthLayout. */
export function AuthCard({ children, className, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      className={cn(
        "relative z-[2] -mt-7 flex w-full max-w-[440px] flex-col gap-[18px] rounded-[18px] border border-line bg-white px-[18px] py-6 shadow-auth min-[900px]:mt-0 min-[900px]:rounded-dialog min-[900px]:p-8",
        className,
      )}
      {...props}
    >
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

/** Input with a leading icon, 48px tall (auth pages). */
export const authInputClass =
  "h-12 w-full rounded-control border border-line-strong bg-white pl-3.5 pr-[42px] text-right text-[15px] text-navy-900 outline-none transition placeholder:text-slate-400 focus:shadow-focus-mint aria-[invalid=true]:border-redeemed aria-[invalid=true]:bg-[#fffafa]";
