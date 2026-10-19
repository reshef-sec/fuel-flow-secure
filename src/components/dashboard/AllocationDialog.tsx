import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button, FormField, Input, Select } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { FuelBreakdown, FuelSplitFields, emptySplit, fuelTotals, readSplit } from "@/components/fuel/fuel";
import { loadIssuanceStock } from "@/lib/cloudSync";
import { useLiveInventory } from "@/lib/useLiveInventory";
import { centralPoolOf, fullName, poolShortage, useAppStore, useCurrentUser } from "@/store/appStore";

export function AllocationDialog({
  open,
  onClose,
  presetTarget,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-selected branch name, used by the quick-allocate action on branch cards. */
  presetTarget?: string;
}) {
  const vouchers = useAppStore((s) => s.vouchers);
  const pool = centralPoolOf(vouchers);
  const available = fuelTotals(pool);
  const balance = available["בנזין"] + available["סולר"];
  const allocate = useAppStore((s) => s.allocate);
  const branchList = useAppStore((s) => s.branchList);
  const users = useAppStore((s) => s.users);
  const me = useCurrentUser();
  useLiveInventory(open);

  const targets: { value: string; label: string; branch: string; supervisor?: string }[] = [
    ...branchList.map((b) => ({ value: b.name, label: b.name, branch: b.name })),
    ...users
      .filter((u) => u.role === "supervisor")
      .map((u) => ({
        value: `${u.branch}|${fullName(u)}`,
        label: `${u.branch} (${fullName(u)})`,
        branch: u.branch,
        supervisor: fullName(u),
      })),
  ];
  const [target, setTarget] = useState("");
  const [split, setSplit] = useState(emptySplit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget(presetTarget ?? "");
    setSplit(emptySplit());
    setError(null);
    setLoading(false);
  }, [open, presetTarget]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = readSplit(split);
    if (!target) return setError("יש לבחור יעד הקצאה");
    if (typeof parsed === "string") return setError(parsed);
    setError(null);
    setLoading(true);
    try {
      const stock = await loadIssuanceStock();
      useAppStore.setState({ vouchers: stock });
      const shortage = poolShortage(parsed, stock);
      if (shortage) { setError(shortage); toast.error(shortage); return; }
      const picked = targets.find((t) => t.value === target);
      const approver = me ? fullName(me) : "אדמין מרכזי";
      for (const f of ["בנזין", "סולר"] as const)
        if (parsed[f]) {
          const err = allocate(picked?.branch ?? target, picked?.supervisor, parsed[f], { approver, fuelType: f });
          if (err) { setError(err); toast.error(err); return; }
        }
      onClose();
      toast.success("ההקצאה בוצעה בהצלחה והיתרה עודכנה");
    } catch {
      const message = "בדיקת המלאי נכשלה — ההקצאה לא בוצעה. יש לנסות שוב";
      setError(message);
      toast.error(message);
    } finally { setLoading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="הקצאת שוברים חדשה">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg bg-mint-100 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface text-teal-600">
            <Wallet className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">יתרה זמינה לחלוקה</p>
            <p className="font-display text-2xl font-extrabold tabular-nums text-secondary">
              {balance.toLocaleString("he-IL")} ₪
            </p>
            <FuelBreakdown list={pool} className="mt-1" />
          </div>
        </div>

        <FormField label="בחר יעד הקצאה">
          <Select
            id="alloc-target"
            aria-label="בחר יעד הקצאה"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">בחר יעד…</option>
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FuelSplitFields values={split} onChange={setSplit} available={available} />

        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            ביטול
          </Button>
          <Button type="submit" loading={loading}>
            בצע הקצאה
          </Button>
        </div>
      </form>
    </Modal>
  );
}
