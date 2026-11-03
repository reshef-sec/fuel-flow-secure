import type { ReactNode } from "react";
import { logoAssets } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

/**
 * PageHero — the navy band that opens every internal page (design: Main.dc.html `.hero`).
 * Eyebrow (small mint caps), H1 title, ONE short subtitle line, and an actions slot on the
 * left (RTL end). A faint ring emblem sits behind as a watermark. Use `.ds-btn ds-btn-onnavy`
 * (primary) / `.ds-btn ds-btn-glass` (secondary) / `.ds-tpllink` for buttons inside `actions`.
 *
 *   <PageHero eyebrow="ניהול מלאי" title="מלאי שוברים" subtitle="כל כרטיסי הדלק במלאי."
 *     actions={<button className="ds-btn ds-btn-onnavy">ייבוא</button>} />
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons rendered at the end side; they stretch to full width on mobile. */
  actions?: ReactNode;
  /** Optional extra content under the title row (keep it minimal). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[18px] bg-shell px-5 py-[22px] text-white shadow-hero min-[900px]:rounded-hero min-[900px]:px-[34px] min-[900px]:py-[30px]",
        className,
      )}
      style={{
        backgroundImage:
          "radial-gradient(80% 140% at 100% 0%, rgba(31,95,208,0.55), transparent 60%), radial-gradient(60% 120% at 0% 100%, rgba(69,205,186,0.18), transparent 60%)",
      }}
    >
      <img
        src={logoAssets["emblem-reversed"]}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -left-10 top-1/2 h-[260px] w-auto -translate-y-1/2 opacity-[0.13]"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-[18px]">
        <div className="flex min-w-0 max-w-[640px] flex-col gap-2">
          {eyebrow ? <span className="text-xs font-bold tracking-[.1em] text-mint-300">{eyebrow}</span> : null}
          <h1 className="m-0 text-2xl font-extrabold tracking-[-.01em] min-[900px]:text-[30px]">{title}</h1>
          {subtitle ? <p className="m-0 text-[15px] text-shell-text">{subtitle}</p> : null}
        </div>
        {actions ? (
          <div className="flex w-full flex-wrap items-start gap-3 max-[899.98px]:[&>*]:flex-1 min-[900px]:w-auto">{actions}</div>
        ) : null}
      </div>
      {children ? <div className="relative mt-5">{children}</div> : null}
    </section>
  );
}
