import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button, FormField, Input, Select } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
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

  const supervisors = users.filter((u) => u.role === "supervisor" && u.branch === branch);
  const [supervisor, setSupervisor] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupervisor("");
    setAmount("");
    setError(null);
    setLoading(false);
  }, [open]);

  const numeric = Number(amount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supervisor || !numeric) {
      setError("יש לבחור מפקח ולהזין סכום");
      return;
    }
    if (numeric % 100 !== 0) {
      setError("הסכום חייב להיות בכפולות של 100 ₪");
      return;
    }
    if (numeric > branchBalance) {
      setError("הסכום גבוה מהיתרה הזמינה בסניף");
      return;
    }
    setError(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      assignToSupervisor(branch, supervisor, numeric);
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

        <FormField label="סכום להעברה (₪)" hint="בכפולות של 100 ₪ בלבד">
          <Input
            aria-label="סכום להעברה"
            type="number"
            min={100}
            step={100}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500"
            className="tabular-nums"
          />
        </FormField>

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
