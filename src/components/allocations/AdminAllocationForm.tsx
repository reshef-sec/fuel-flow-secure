import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { emptySplit, readSplit, type FuelType } from "@/components/fuel/fuel";
import type { ResultSummary } from "@/components/ui/ResultDialog";
import { loadIssuanceStock } from "@/lib/cloudSync";
import { centralPoolOf } from "@/lib/centralInventory";
import type { CentralInventorySummary } from "@/lib/centralInventorySummary";
import { STOCK_SHORTAGE } from "@/lib/issuanceInventory";
import { branchLabel } from "@/lib/branchLabels";
import { pickExact } from "@/lib/inventorySelection";
import { fullName, poolShortage, useAppStore, useCurrentUser } from "@/store/appStore";
import { AllocationFormFields, cardsText } from "./AllocationForm";
import { adminRecipients, recipientRoleText, recipientTarget } from "./allocationRecipients";

const fmt = (n: number) => n.toLocaleString("he-IL");
const fuelWord = (f: FuelType) => (f === "בנזין" ? "בנזין 95" : "סולר");

/**
 * Admin allocation from the central pool to a branch manager / "רשאי להקים דרישה" user.
 * Submit logic is the previous AllocationDialog's, unchanged: fresh summary check → reload stock →
 * poolShortage → `allocate(branch, supervisor, amount, { approver, fuelType })` per fuel, sequentially,
 * refreshing after each successful fuel.
 */
export function AdminAllocationForm({
  active,
  summary,
  inventoryError,
  refresh,
  stockReady,
  presetTarget,
  onAllocated,
  onDone,
  onCancel,
  idPrefix = "alloc",
}: {
  active: boolean;
  summary: CentralInventorySummary | null;
  inventoryError: string | null;
  refresh: () => Promise<CentralInventorySummary>;
  stockReady: boolean;
  /** Pre-selected branch name: picks that branch's manager (or first recipient of the branch). */
  presetTarget?: string;
  onAllocated?: () => Promise<unknown>;
  onDone: (result: ResultSummary) => void;
  onCancel?: () => void;
  idPrefix?: string;
}) {
  const allocate = useAppStore((s) => s.allocate);
  const users = useAppStore((s) => s.users);
  const stock = useAppStore((s) => s.vouchers);
  const me = useCurrentUser();

  const recipients = useMemo(() => adminRecipients(users), [users]);
  const available = summary ? { "בנזין": summary.gasoline_amount, "סולר": summary.diesel_amount } : null;
  const pools = useMemo(() => ({ "בנזין": centralPoolOf(stock, "בנזין"), "סולר": centralPoolOf(stock, "סולר") }), [stock]);

  const [target, setTarget] = useState("");
  const [split, setSplit] = useState(emptySplit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentSplit = readSplit(split);
  const stockError = typeof currentSplit === "string" ? null : poolShortage(currentSplit, stock);

  useEffect(() => {
    if (!active) return;
    const preset = presetTarget
      ? recipients.find((u) => u.branch === presetTarget && u.role === "branch") ?? recipients.find((u) => u.branch === presetTarget)
      : undefined;
    setTarget(preset?.id ?? "");
    setSplit(emptySplit());
    setError(null);
    setLoading(false);
  }, [active, presetTarget, recipients]);
  useEffect(() => { setError(null); }, [target, split]);

  const picked = recipients.find((u) => u.id === target);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = readSplit(split);
    if (!picked) return setError("יש לבחור מקבל הקצאה");
    if (typeof parsed === "string") return setError(parsed);
    const { branch, supervisor } = recipientTarget(picked);
    setError(null);
    setLoading(true);
    const done: string[] = [];
    const cards: string[] = [];
    try {
      const fresh = await refresh();
      if (parsed["בנזין"] > fresh.gasoline_amount || parsed["סולר"] > fresh.diesel_amount) {
        const message = STOCK_SHORTAGE;
        setError(message); toast.error(message); return;
      }
      const latest = await loadIssuanceStock();
      useAppStore.setState({ vouchers: latest });
      const shortage = poolShortage(parsed, latest);
      if (shortage) { setError(shortage); toast.error(shortage); return; }
      const approver = me ? fullName(me) : "אדמין מרכזי";
      for (const f of ["בנזין", "סולר"] as const)
        if (parsed[f]) {
          // Preview of the cards the store will pick (same pickExact over the same pool).
          const preview = pickExact(centralPoolOf(useAppStore.getState().vouchers, f), parsed[f]);
          const err = await allocate(branch, supervisor, parsed[f], { approver, fuelType: f });
          if (err) {
            if (done.length) {
              // Partial success: clear the fuel that was already allocated so a retry can't double it.
              setSplit((s) => ({ ...s, "בנזין": "" }));
              onDone({ tone: "warning", title: "ההקצאה בוצעה חלקית", line: `הוקצו ${done.join(" ו-")} ל${fullName(picked)}. ${fuelWord(f)} לא הוקצה: ${err}`, detail: cards.join(" · ") || undefined });
            }
            setError(err); toast.error(err); return;
          }
          done.push(`${fmt(parsed[f])} ₪ ${fuelWord(f)}`);
          if (preview) cards.push(`${fuelWord(f)}: ${cardsText(preview)}`);
          await refresh().catch(() => {});
          await onAllocated?.().catch(() => {});
        }
      setTarget("");
      setSplit(emptySplit());
      onDone({
        tone: "success",
        title: "ההקצאה בוצעה",
        line: `הוקצו ${done.join(" ו-")} ל${fullName(picked)} (${branchLabel(branch)})`,
        detail: cards.join(" · ") || undefined,
      });
    } catch {
      const message = "בדיקת המלאי נכשלה — ההקצאה לא בוצעה. יש לנסות שוב";
      setError(message);
      toast.error(message);
    } finally { setLoading(false); }
  }

  const recipientHint = picked ? `ההקצאה תועבר ל${supervisorOrBranch(picked)}` : undefined;

  return (
    <form onSubmit={submit} noValidate>
      <AllocationFormFields
        idPrefix={idPrefix}
        recipientLabel="מקבל ההקצאה"
        recipientPlaceholder="בחירת מנהל סניף או מורשה דרישה…"
        recipients={recipients.map((u) => ({
          value: u.id,
          label: `${fullName(u)} · ${recipientRoleText(u)} · ${branchLabel(u.branch)}`,
          group: `סניף ${branchLabel(u.branch)}`,
        }))}
        recipient={target}
        onRecipient={setTarget}
        recipientHint={recipientHint}
        emptyRecipientsNote="אין משתמשים מתאימים. יש להגדיר מנהל סניף או משתמש ״רשאי להקים דרישה״ בהגדרות → ניהול משתמשים."
        values={split}
        onValues={setSplit}
        available={available}
        pools={pools}
        availPrefix="זמין במאגר"
        overLabel="חורג מהזמין במאגר"
        error={error ?? (summary ? null : inventoryError)}
        fallbackError={stockError}
        loading={loading}
        submitDisabled={!summary || !stockReady || !!stockError || typeof currentSplit === "string" || !picked}
        onCancel={onCancel}
      />
    </form>
  );
}

function supervisorOrBranch(u: Parameters<typeof recipientTarget>[0]) {
  const t = recipientTarget(u);
  return t.supervisor ? `מלאי המפקח ${t.supervisor} (${branchLabel(t.branch)})` : `מאגר סניף ${branchLabel(t.branch)}`;
}
