import { Check } from "lucide-react";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

/**
 * StepIndicator — numbered progress dots for the employee voucher flow (design: Worker.dc.html).
 * Done steps turn green with a check, the current one is brand blue with a halo.
 */
export function StepIndicator({ steps, current, label = "שלבי קבלת השוברים" }: { steps: readonly string[]; current: number; label?: string }) {
  return (
    <ol aria-label={label} className="m-0 flex list-none items-start gap-1 px-1 py-0">
      {steps.map((name, i) => {
        const done = i < current;
        const cur = i === current;
        return (
          <li key={name} aria-current={cur ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-1.5 text-xs font-semibold text-slate-600">
            {i > 0 ? (
              // Connector towards the previous step (which sits to the right in RTL).
              <span
                aria-hidden
                className={cn("absolute top-[14px] h-0.5 rounded-full", done || cur ? "bg-available" : "bg-[#e3e8f0]")}
                style={{ left: "calc(50% + 19px)", width: "calc(100% - 34px)" }}
              />
            ) : null}
            <span
              className={cn(
                "relative grid size-[30px] place-items-center rounded-full text-[13px] font-bold",
                cur ? "bg-blue-500 text-white shadow-[0_0_0_4px_#dbe7fb]" : done ? "bg-available text-white" : "bg-[#e3e8f0] text-slate-600",
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={cur ? "font-bold text-navy-900" : undefined}>
              {name}
              {done ? <span className="sr-only"> (הושלם)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
