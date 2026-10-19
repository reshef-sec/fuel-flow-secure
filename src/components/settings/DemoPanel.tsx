import { useState } from "react";
import { toast } from "sonner";
import { Database, RotateCcw, FlaskConical } from "lucide-react";
import { Button } from "@/design-system/delek-1ea111";
import { db } from "@/lib/cloudSync";
import { useAppStore } from "@/store/appStore";

const BRANCHES = [
  { id: "demo-center", name: "מרכז", manager: "דנה לוי", city: "תל אביב" },
  { id: "demo-north", name: "צפון", manager: "יוסי כהן", city: "חיפה" },
  { id: "demo-south", name: "דרום", manager: "רונית אברהם", city: "באר שבע" },
];
const SUPS = ["מפקח דן", "מפקח אלון"];
const STATUSES = ["טרם שומש", "טרם שומש", "הוקצה לעובד", "מומש סופית", "חסום"];

function demoVouchers() {
  const today = new Date();
  return Array.from({ length: 60 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (i % 40));
    const b = BRANCHES[i % 3].name;
    const status = i < 20 ? "טרם שומש" : STATUSES[i % STATUSES.length];
    const branch = i < 20 ? "מאגר ראשי" : i % 4 === 0 ? `${b} (${SUPS[i % 2]})` : b;
    return {
      serial: `DEMO-${String(i + 1).padStart(4, "0")}`,
      real_code: `${1000 + i}-DEMO-${5000 + i}`,
      amount: 100,
      branch,
      status,
      updated_on: d.toISOString().slice(0, 10),
      supervisor: branch.includes("(") ? SUPS[i % 2] : null,
      worker_name: status === "הוקצה לעובד" || status === "מומש סופית" ? `עובד דמו ${i}` : null,
      reason: status !== "טרם שומש" ? "נסיעה לאתר לקוח" : null,
    };
  });
}

export function DemoPanel() {
  const loadFromCloud = useAppStore((s) => s.loadFromCloud);
  const [busy, setBusy] = useState<"seed" | "reset" | null>(null);
  const [confirm, setConfirm] = useState(false);

  const refresh = async () => {
    useAppStore.setState({ loaded: false });
    await loadFromCloud();
  };

  const seed = async () => {
    setBusy("seed");
    try {
      const steps = [
        db.from("branches").upsert(BRANCHES),
        db.from("issue_reasons").insert([
          { name: "נסיעה לאתר לקוח", category: "Regular" },
          { name: "תדלוק רכב חברה", category: "B2B" },
        ]),
        db.from("vouchers").upsert(demoVouchers()),
        db.from("voucher_requests").upsert([
          { id: "demo-req-1", requester: "דנה לוי", requester_id: "", branch: "מרכז", amount: 500, reason: "תגבור משמרות", created_on: new Date().toISOString().slice(0, 10), status: "ממתין לאישור" },
          { id: "demo-req-2", requester: "יוסי כהן", requester_id: "", branch: "צפון", amount: 300, reason: "אירוע חריג", created_on: new Date().toISOString().slice(0, 10), status: "ממתין לאישור" },
        ]),
      ];
      for (const p of steps) {
        const { error } = await p;
        if (error) throw error;
      }
      await refresh();
      toast.success("נתוני הדמו הוזנו בהצלחה");
    } catch (e) {
      toast.error(`הזנת נתוני דמו נכשלה: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setConfirm(false);
    setBusy("reset");
    try {
      const { error } = await db.rpc("reset_demo_data");
      if (error) throw error;
      await refresh();
      toast.success("הנתונים אופסו");
    } catch (e) {
      toast.error(`איפוס נכשל: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <FlaskConical className="size-5 text-primary" />
        <h2 className="font-display text-lg font-extrabold text-secondary">סביבת דמו</h2>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        הזנת נתונים לדוגמה (שוברים, הקצאות ודרישות) לצורך הדגמה, ואיפוס של נתוני התפעול. משתמשים, סניפים, לקוחות וסיבות הנפקה אינם נמחקים.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={seed} loading={busy === "seed"} disabled={!!busy}>
          <Database className="size-4" /> הזנת נתוני דמו
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)} loading={busy === "reset"} disabled={!!busy}>
          <RotateCcw className="size-4" /> איפוס נתונים
        </Button>
      </div>

      {confirm ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-navy-900/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-card">
            <p className="mb-2 text-base font-bold text-secondary">האם את בטוחה שברצונך לאפס את הנתונים?</p>
            <p className="mb-6 text-sm text-muted-foreground">פעולה זו תמחק את כל נתוני התפעול: שוברים, הקצאות, דרישות, קישורי עובדים, ארכיון חתימות ויומן פעילות. משתמשים, סניפים, מאגרי הלקוחות וסיבות ההנפקה יישמרו.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirm(false)}>לא</Button>
              <Button variant="danger" onClick={reset}>כן</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
