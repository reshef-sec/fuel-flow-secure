import { useEffect, useState } from "react";
import { FlaskConical, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { useAuthContext } from "@/lib/auth-context";
import { generateDemoData, getDevelopmentToolsAccess, resetSystemData } from "@/lib/backend";
import { canUseDevelopmentTools, isResetConfirmed, RESET_CONFIRMATION } from "@/lib/developmentAccess";
import { notifyCentralInventoryChanged } from "@/lib/centralInventorySummary";
import { useAppStore } from "@/store/appStore";

export function DevelopmentPanel() {
  const { session } = useAuthContext();
  const userId = session?.user.id;
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [modal, setModal] = useState<"demo" | "reset" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const loadFromCloud = useAppStore(s => s.loadFromCloud);

  useEffect(() => {
    let cancelled = false;
    setVerifiedUserId(null);
    if (userId) void getDevelopmentToolsAccess().then(allowed => {
      if (!cancelled) setVerifiedUserId(allowed === true ? userId : null);
    }).catch(() => { /* Missing SQL or denied access: render nothing. */ });
    return () => { cancelled = true; };
  }, [userId]);

  if (!canUseDevelopmentTools(userId, verifiedUserId)) return null;

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
    <section className="mt-8 border-t border-border pt-6" aria-labelledby="development-title">
      <h2 id="development-title" className="flex items-center gap-2 text-lg font-bold text-secondary">
        <FlaskConical className="size-5" />כלי פיתוח ובדיקות
      </h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setModal("demo")} disabled={busy}><FlaskConical className="size-4" />טעינת נתוני הדגמה</Button>
        <Button variant="danger" onClick={() => setModal("reset")} disabled={busy}><Trash2 className="size-4" />איפוס וניקוי נתונים</Button>
      </div>
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