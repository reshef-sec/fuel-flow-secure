import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PlayCircle, ShieldCheck } from "lucide-react";

import { Logo } from "@/design-system/delek-1ea111";
import { getPublicTraining } from "@/lib/training";

/**
 * Public viewing page for a training video (/training/<token>). Plays the shared video only —
 * no login, no navigation into the system. A revoked or unknown link shows a short notice.
 */
export const Route = createFileRoute("/training/$token")({
  head: () => ({
    meta: [
      { title: "סרטון הדרכה | רשף ביטחון" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: TrainingViewer,
});

function TrainingViewer() {
  const { token } = Route.useParams();
  const [state, setState] = useState<"loading" | "invalid" | { title: string }>("loading");
  useEffect(() => {
    let cancelled = false;
    void getPublicTraining(token).then((r) => { if (!cancelled) setState(r ? { title: r.title } : "invalid"); });
    return () => { cancelled = true; };
  }, [token]);
  const base = `/api/training/public/${encodeURIComponent(token)}`;

  return (
    <main dir="rtl" className="min-h-screen bg-[radial-gradient(1100px_650px_at_75%_10%,#16357a_0%,#0b1f4b_50%,#071430_100%)] px-4 py-8 text-white min-[900px]:px-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <Logo variant="reversed" className="h-[54px]" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-bold text-mint-300">
            <PlayCircle className="size-4" aria-hidden /> סרטון הדרכה
          </span>
        </header>
        {state === "loading" ? (
          <p className="m-0 text-center text-sm text-slate-300">טוען…</p>
        ) : state === "invalid" ? (
          <section className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <h1 className="m-0 text-2xl font-extrabold">הקישור אינו תקף</h1>
            <p className="m-0 text-sm text-slate-300">ייתכן שהקישור בוטל. לקבלת קישור חדש פנו למנהלת המערכת.</p>
          </section>
        ) : (
          <>
            <h1 className="m-0 text-[26px] font-extrabold leading-tight min-[900px]:text-[34px]">{state.title}</h1>
            <video
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload"
              poster={`${base}/poster`}
              src={`${base}/video`}
              className="aspect-video w-full rounded-2xl bg-black shadow-[0_30px_80px_rgba(0,0,0,.5)]"
            />
            <p className="m-0 inline-flex items-center gap-1.5 text-xs text-slate-300">
              <ShieldCheck className="size-4" aria-hidden /> צפייה בלבד · הקישור אינו מעניק גישה למערכת רשף ביטחון
            </p>
          </>
        )}
      </div>
    </main>
  );
}
