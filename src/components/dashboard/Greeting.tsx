import { useEffect, useState } from "react";
import { Moon, Sparkles, Sun } from "lucide-react";

import { useAuthContext } from "@/lib/auth-context";

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

export function Greeting() {
  // Always the signed-in account, never a role-preview user.
  const { profile } = useAuthContext();
  // Computed after mount so server and browser render the same markup.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    setHour(israelHour());
    const t = setInterval(() => setHour(israelHour()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (hour === null) return <div className="mb-5 h-[60px]" aria-hidden />;
  const g = slot(hour);
  const name = (profile?.full_name ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <div className="mb-5">
      <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold text-secondary">
        {g.kind === "sun" ? (
          <Sun className="size-7 shrink-0 animate-[spin_20s_linear_infinite] text-warning" aria-hidden />
        ) : (
          <span className="relative inline-flex size-7 shrink-0" aria-hidden>
            <Moon className="size-7 fill-warning/30 text-warning" />
            <Sparkles className={g.kind === "night" ? "absolute -top-1 -start-2 size-3.5 animate-pulse text-violet-400" : "absolute -top-1 -start-2 size-3 text-violet-400"} />
          </span>
        )}
        <span>
          {g.text}
          {name ? (
            <>
              , <span className="text-primary">{name}</span>
            </>
          ) : null}
          ! 👋
        </span>
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">הנה תמונת המצב העדכנית של המערכת להיום.</p>
    </div>
  );
}
