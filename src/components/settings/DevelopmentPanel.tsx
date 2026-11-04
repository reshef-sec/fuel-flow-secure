import { useState } from "react";
import { FlaskConical, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { LearningCard } from "@/components/learning/LearningMode";
import { generateDemoData, resetSystemData } from "@/lib/backend";
import { isResetConfirmed, RESET_CONFIRMATION } from "@/lib/developmentAccess";
import { useDevelopmentToolsAccess } from "@/lib/superAdmin";
import { notifyCentralInventoryChanged } from "@/lib/centralInventorySummary";
import { useAppStore } from "@/store/appStore";

export function DevelopmentPanel() {
  // Visible only when the server RPC can_use_development_tools says so (fails closed).
  const allowed = useDevelopmentToolsAccess();
  const [modal, setModal] = useState<"demo" | "reset" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const loadFromCloud = useAppStore(s => s.loadFromCloud);

  if (!allowed) return null;

  const close = () => { if (!busy) { setModal(null); setConfirmation(""); } };
  const execute = async () => {
    if (busy || !modal || (modal === "reset" && !isResetConfirmed(confirmation))) return;
    setBusy(true);
    try {
      if (modal === "demo") {
        const result = await generateDemoData();
        toast.success(`נוצרו ${result.vouchers_created} שוברי הדגמה`);
      } else {
        await resetSystemData(confirmation.trim());
        toast.success("נתוני הפעילות אופסו; המשתמשים ומאגרי הבסיס נשמרו");
      }
      setModal(null);
      setConfirmation("");
      await loadFromCloud();
      notifyCentralInventoryChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הפעולה נכשלה");
    } finally { setBusy(false); }
  };

  return (
    <section className="flex max-w-4xl flex-col gap-3" aria-labelledby="development-title">
      <h2 id="development-title" className="sr-only">כלי פיתוח ובדיקות</h2>
      <div className="inline-flex items-center gap-2 self-start rounded-pill bg-waiting-bg px-3 py-1 text-[12.5px] font-bold text-waiting-fg">
        <ShieldCheck className="size-4" aria-hidden />
        גלוי רק לבעלת המערכת
      </div>
      <LearningCard />
      <article className="ds-card flex flex-wrap items-center justify-between gap-3 px-[18px] py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 text-base font-extrabold text-navy-900">נתוני הדגמה</h3>
          <span className="text-[13px] text-slate-600">שוברי בדיקה ללא קודי מימוש אמיתיים.</span>
        </div>
        <button type="button" className="ds-btn ds-btn-light max-[899.98px]:w-full" onClick={() => setModal("demo")} disabled={busy}>
          <FlaskConical className="size-4" aria-hidden />טעינת נתוני הדגמה
        </button>
      </article>
      <article className="ds-card flex flex-wrap items-center justify-between gap-3 border-redeemed-bg px-[18px] py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 text-base font-extrabold text-redeemed-fg">איפוס וניקוי נתונים</h3>
          <span className="text-[13px] text-slate-600">מוחק את כל השוברים והפעילויות. משתמשים, סניפים ומאגרים נשמרים. לא ניתן לבטל.</span>
        </div>
        <Button variant="danger" className="min-h-11 max-[899.98px]:w-full" onClick={() => setModal("reset")} disabled={busy}>
          <Trash2 className="size-4" />איפוס וניקוי נתונים
        </Button>
      </article>
      <Modal open={modal !== null} onClose={close} title={modal === "reset" ? "איפוס וניקוי נתונים" : "טעינת נתוני הדגמה"}>
        {modal === "reset" ? <>
          <p className="flex items-start gap-2 font-semibold text-danger"><TriangleAlert className="size-5 shrink-0" />פעולה זו תמחק את כל השוברים, הפעילויות והנתונים במערכת</p>
          <p className="mt-3 text-sm text-muted-foreground">המחיקה אינה ניתנת לביטול. המשתמשים, הסניפים, מאגרי הלקוחות וסיבות ההנפקה יישמרו. קבצים שמורים לא יימחקו.</p>
          <Label htmlFor="reset-confirmation" className="mt-5 block">להמשך, הקלידו: {RESET_CONFIRMATION}</Label>
          <Input id="reset-confirmation" className="mt-2" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} autoComplete="off" />
        </> : <p className="text-sm text-muted-foreground">יצירת שוברי בנזין וסולר לבדיקה במאגר המרכזי ובסניפים הקיימים, ללא קודי מימוש אמיתיים. אפשר לטעון רק כשהמלאי ונתוני הפעילות ריקים.</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={close} disabled={busy}>ביטול</Button>
          <Button variant={modal === "reset" ? "danger" : "primary"} loading={busy} disabled={modal === "reset" && !isResetConfirmed(confirmation)} onClick={() => void execute()}>
            {modal === "reset" ? <Trash2 className="size-4" /> : <FlaskConical className="size-4" />}
            {modal === "reset" ? "מחיקה ואיפוס סופי" : "טעינת נתוני הדגמה"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
