import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, PlayCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createTrainingShare, getTraining, revokeTrainingShare, trainingShareUrl,
  type TrainingShare, type TrainingVideo, type TrainingVideoId,
} from "@/lib/training";
import { SettingsCard } from "./shared";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL") : "—");

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("הקישור הועתק");
  } catch {
    toast.message(text);
  }
}

/**
 * סרטוני הדרכה — visible only to the system owner (same server check as כלי פיתוח), in the real and the
 * learning environment. Each video can be shared with a revocable viewing link that opens the video
 * only — the viewer gets no access to the system.
 */
export function TrainingPanel() {
  const [videos, setVideos] = useState<TrainingVideo[] | null>(null);
  const [shares, setShares] = useState<TrainingShare[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getTraining();
      setVideos(r.videos);
      setShares(r.shares);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "טעינת הסרטונים נכשלה");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function share(video: TrainingVideoId) {
    setBusy(video);
    try {
      const token = await createTrainingShare(video);
      await copy(trainingShareUrl(token));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "יצירת הקישור נכשלה");
    } finally {
      setBusy(null);
    }
  }
  async function revoke(token: string) {
    setBusy(token);
    try {
      await revokeTrainingShare(token);
      toast.success("הקישור בוטל — הוא כבר לא פותח את הסרטון");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ביטול הקישור נכשל");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p role="alert" className="m-0 text-sm font-semibold text-danger">{error}</p>;
  if (!videos) return <p className="m-0 text-sm text-slate-600">טוען סרטונים…</p>;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-[18px] min-[1100px]:grid-cols-2">
        {videos.map((v) => {
          const mine = shares.filter((s) => s.video === v.id);
          return (
            <SettingsCard
              key={v.id}
              label={v.title}
              title={<span className="inline-flex items-center gap-2"><PlayCircle className="size-5 text-available-fg" aria-hidden />{v.title}</span>}
              sub="גלוי רק לך · אפשר לשתף קישור צפייה שאינו נותן גישה למערכת"
            >
              <div className="flex flex-col gap-4 p-[18px]">
                {v.available ? (
                  <video
                    controls
                    preload="metadata"
                    poster={`/api/training/poster/${v.id}`}
                    src={`/api/training/video/${v.id}`}
                    className="aspect-video w-full rounded-xl bg-navy-900"
                  />
                ) : (
                  <p className="m-0 text-sm text-slate-600">הסרטון עדיין לא זמין.</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] text-slate-600">
                    קישורי צפייה פעילים: <b className="ds-num text-navy-900">{mine.length}</b>
                  </span>
                  <button type="button" className="ds-btn ds-btn-primary" disabled={busy !== null || !v.available} onClick={() => void share(v.id)}>
                    <Link2 className="size-4" aria-hidden />
                    יצירת קישור צפייה
                  </button>
                </div>
                {mine.length ? (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {mine.map((s) => (
                      <li key={s.token} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-table-head px-3 py-2.5 text-[13px]">
                        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-700" dir="ltr" title={trainingShareUrl(s.token)}>
                          {trainingShareUrl(s.token)}
                        </span>
                        <span className="whitespace-nowrap text-slate-600">
                          נוצר {fmtDate(s.created_at)} · <span className="ds-num">{s.views}</span> צפיות
                        </span>
                        <button type="button" className="ds-rowact" aria-label="העתקת קישור הצפייה" onClick={() => void copy(trainingShareUrl(s.token))}>
                          <Copy className="size-3.5" aria-hidden /> העתקה
                        </button>
                        <button type="button" className="ds-rowact !text-redeemed-fg" aria-label="ביטול קישור הצפייה" disabled={busy !== null} onClick={() => void revoke(s.token)}>
                          <Trash2 className="size-3.5" aria-hidden /> ביטול
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </SettingsCard>
          );
        })}
      </div>
    </div>
  );
}
