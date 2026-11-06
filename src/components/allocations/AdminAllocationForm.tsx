import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { emptySplit, type FuelType } from "@/components/fuel/fuel";
import type { ResultSummary } from "@/components/ui/ResultDialog";
import { loadIssuanceStock } from "@/lib/cloudSync";
import { centralPoolOf } from "@/lib/centralInventory";
import type { CentralInventorySummary } from "@/lib/centralInventorySummary";
import { STOCK_SHORTAGE } from "@/lib/issuanceInventory";
import { branchLabel } from "@/lib/branchLabels";
import { emptySizeCounts, pickBySize, readSizeCounts, stockFromSummary } from "@/lib/allocationSizes";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";
import { AllocationFormFields, cardsText } from "./AllocationForm";
import { SizePicker } from "./SizePicker";
import { adminRecipients, recipientRoleText, recipientTarget } from "./allocationRecipients";

const FUELS = ["בנזין", "סולר"] as const;
const NO_AMOUNTS = emptySplit();
const fmt = (n: number) => n.toLocaleString("he-IL");
const fuelWord = (f: FuelType) => (f === "בנזין" ? "בנזין 95" : "סולר");

/**
 * Admin allocation from the central pool to a branch manager / "רשאי להקים דרישה" user.
 * The admin chooses how many cards of each size to send. Submit: fresh summary check → reload stock →
 * the chosen cards must still exist → `allocate(branch, supervisor, amount, { approver, fuelType, sizes })`
 * per fuel, sequentially, refreshing after each successful fuel.
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
  const [sizeCounts, setSizeCounts] = useState(emptySizeCounts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sizeStock = useMemo(() => stockFromSummary(summary?.denominations), [summary]);
  const selection = readSizeCounts(sizeCounts, sizeStock);
  const sizeTotal = typeof selection === "string" ? 0 : selection.split["בנזין"] + selection.split["סולר"];

  useEffect(() => {
    if (!active) return;
    const preset = presetTarget
      ? recipients.find((u) => u.branch === presetTarget && u.role === "branch") ?? recipients.find((u) => u.branch === presetTarget)
      : undefined;
    setTarget(preset?.id ?? "");
    setSizeCounts(emptySizeCounts());
    setError(null);
    setLoading(false);
  }, [active, presetTarget, recipients]);
  useEffect(() => { setError(null); }, [target, sizeCounts]);

  const picked = recipients.find((u) => u.id === target);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return setError("יש לבחור מקבל הקצאה");
    if (typeof selection === "string") return setError(selection);
    const { sizes, split: parsed } = selection;
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
      // Fresh stock may have changed since the form opened: re-check the chosen sizes against it.
      if (FUELS.some((f) => parsed[f] > 0 && !pickBySize(centralPoolOf(latest, f), sizes[f]))) {
        setError(STOCK_SHORTAGE); toast.error(STOCK_SHORTAGE); return;
      }
      const approver = me ? fullName(me) : "אדמין מרכזי";
      for (const f of FUELS)
        if (parsed[f]) {
          // Preview of the cards the store will pick (same selection over the same pool).
          const pool = centralPoolOf(useAppStore.getState().vouchers, f);
          const preview = pickBySize(pool, sizes[f]);
          const err = await allocate(branch, supervisor, parsed[f], { approver, fuelType: f, sizes: sizes[f] });
          if (err) {
            if (done.length) {
              // Partial success: clear the fuel that was already allocated so a retry can't double it.
              setSizeCounts((c) => ({ ...c, "בנזין": emptySizeCounts()["בנזין"] }));
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
      setSizeCounts(emptySizeCounts());
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
        sizePicker={{ total: sizeTotal, picker: <SizePicker idPrefix={idPrefix} counts={sizeCounts} onCounts={setSizeCounts} stock={sizeStock} /> }}
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
        values={NO_AMOUNTS}
        onValues={() => undefined}
        available={available}
        pools={pools}
        availPrefix="זמין במאגר"
        overLabel="חורג מהזמין במאגר"
        error={error ?? (summary ? null : inventoryError)}
        loading={loading}
        submitDisabled={!summary || !stockReady || typeof selection === "string" || !picked}
        onCancel={onCancel}
      />
    </form>
  );
}

function supervisorOrBranch(u: Parameters<typeof recipientTarget>[0]) {
  const t = recipientTarget(u);
  return t.supervisor ? `מלאי המפקח ${t.supervisor} (${branchLabel(t.branch)})` : `מאגר סניף ${branchLabel(t.branch)}`;
}
