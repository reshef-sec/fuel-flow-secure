import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button, FormField, Input, Select } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { FuelBreakdown, FuelSplitFields, emptySplit, fuelOf, readSplit, type FuelType } from "@/components/fuel/fuel";
import { isAvailable } from "@/components/dashboard/voucherData";
import { fullName, useAppStore } from "@/store/appStore";

export function SupervisorAllocationDialog({
  open,
  onClose,
  branch,
  branchBalance,
}: {
  open: boolean;
  onClose: () => void;
  branch: string;
  branchBalance: number;
}) {
  const users = useAppStore((s) => s.users);
  const assignToSupervisor = useAppStore((s) => s.assignToSupervisor);
  const allVouchers = useAppStore((s) => s.vouchers);
  const free = allVouchers.filter((v) => v.branch === branch && !v.supervisor && isAvailable(v) && v.status === "טרם שומש");
  const avail = { "בנזין": 0, "סולר": 0 } as Record<FuelType, number>;
  for (const v of free) avail[fuelOf(v)] += v.amount;

  const supervisors = users.filter((u) => u.role === "supervisor" && u.branch.trim() === branch.trim());
  const [supervisor, setSupervisor] = useState("");
  const [split, setSplit] = useState(emptySplit);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupervisor("");
    setSplit(emptySplit());
    setError(null);
    setLoading(false);
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = readSplit(split);
    if (!supervisor) return setError("יש לבחור מפקח");
    if (typeof parsed === "string") return setError(parsed);
    const numeric = parsed["בנזין"] + parsed["סולר"];
    for (const f of ["בנזין", "סולר"] as const)
      if (parsed[f] > avail[f])
        return setError(`אין מספיק מלאי ${f} בסניף: זמינים ${avail[f].toLocaleString("he-IL")} ₪`);
    if (numeric > branchBalance) {
      setError("הסכום גבוה מהיתרה הזמינה בסניף");
      return;
    }
    setError(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      for (const f of ["בנזין", "סולר"] as const) if (parsed[f]) assignToSupervisor(branch, supervisor, parsed[f], f);
      onClose();
      toast.success(`הועברו ${numeric.toLocaleString("he-IL")} ₪ ל${supervisor}`);
    }, 1000);
  }

  return (
    <Modal open={open} onClose={onClose} title="הקצאה למפקח">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg bg-blue-100 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface text-blue-700">
            <Wallet className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">
              יתרה זמינה במאגר {branch}
            </p>
            <p className="font-display text-2xl font-extrabold tabular-nums text-secondary">
              {branchBalance.toLocaleString("he-IL")} ₪
            </p>
            <FuelBreakdown list={free} />
          </div>
        </div>

        <FormField label="בחר מפקח">
          <Select
            aria-label="בחר מפקח"
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
          >
            <option value="">בחר מפקח…</option>
            {supervisors.map((u) => (
              <option key={u.id} value={fullName(u)}>
                {fullName(u)}
              </option>
            ))}
          </Select>
          {supervisors.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              לא הוגדרו מפקחים לסניף זה. ניתן להוסיף מפקחים בהגדרות → ניהול משתמשים.
            </p>
          ) : null}
        </FormField>

        <FuelSplitFields values={split} onChange={setSplit} available={avail} />

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
