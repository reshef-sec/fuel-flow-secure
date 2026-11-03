import { useEffect, useState } from "react";
import { Moon, Sparkles, Sun } from "lucide-react";

import { useAuthContext } from "@/lib/auth-context";
import { userDisplayName } from "@/lib/userDisplay";

/** Current hour in Israel (Asia/Jerusalem), 0–23. */
function israelHour() {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }).format(new Date());
  return Number(h) % 24;
}

function slot(h: number) {
  if (h >= 5 && h < 12) return { text: "בוקר טוב", kind: "sun" as const };
  if (h >= 12 && h < 17) return { text: "צהריים טובים", kind: "sun" as const };
  if (h >= 17 && h < 21) return { text: "ערב טוב", kind: "moon" as const };
  return { text: "לילה טוב", kind: "night" as const };
}

/** One-line subtitle that goes with the greeting. */
export const GREETING_SUBTITLE = "הנה תמונת המצב העדכנית של המערכת להיום.";

/**
 * Time-of-day greeting for the dashboard PageHero title (on navy): icon + "בוקר טוב, <name>".
 * Always the signed-in account, never a role-preview user.
 */
export function Greeting() {
  const { profile } = useAuthContext();
  // Computed after mount so server and browser render the same markup.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    setHour(israelHour());
    const t = setInterval(() => setHour(israelHour()), 60_000);
    return () => clearInterval(t);
  }, []);
  const name = userDisplayName(profile);
  if (hour === null) return <span className="inline-block min-h-[1.2em]" aria-hidden>{" "}</span>;
  const g = slot(hour);

  return (
    <span className="inline-flex items-center gap-3">
      {g.kind === "sun" ? (
        <Sun className="size-[30px] shrink-0 animate-[spin_20s_linear_infinite] text-[#ffd77a]" strokeWidth={1.8} aria-hidden />
      ) : (
        <span className="relative inline-flex size-[30px] shrink-0" aria-hidden>
          <Moon className="size-[30px] fill-[#ffd77a]/30 text-[#ffd77a]" strokeWidth={1.8} />
          <Sparkles className={g.kind === "night" ? "absolute -top-1 -start-2 size-3.5 animate-pulse text-violet-100" : "absolute -top-1 -start-2 size-3 text-violet-100"} />
        </span>
      )}
      <span>
        {g.text}
        {name ? `, ${name}` : ""}
      </span>
    </span>
  );
}
