import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button, FormField, Input, Select } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { fullName, useAppStore } from "@/store/appStore";

export function AllocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const balance = useAppStore((s) => s.balance);
  const allocate = useAppStore((s) => s.allocate);
  const branchList = useAppStore((s) => s.branchList);
  const users = useAppStore((s) => s.users);

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
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget("");
    setAmount("");
    setError(null);
    setLoading(false);
  }, [open]);

  const numeric = Number(amount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !numeric) {
      setError("יש לבחור יעד ולהזין סכום");
      return;
    }
    if (numeric % 100 !== 0) {
      setError("הסכום חייב להיות בכפולות של 100 ₪");
      return;
    }
    if (numeric > balance) {
      setError("הסכום גבוה מהיתרה הזמינה לחלוקה");
      return;
    }
    setError(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const picked = targets.find((t) => t.value === target);
      allocate(picked?.branch ?? target, picked?.supervisor, numeric);
      onClose();
      toast.success("ההקצאה בוצעה בהצלחה והיתרה עודכנה");
    }, 1000);
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

        <FormField label="סכום להקצאה (₪)" hint="בכפולות של 100 ₪ בלבד">
          <Input
            id="alloc-amount"
            aria-label="סכום להקצאה"
            type="number"
            min={100}
            step={100}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1,000"
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
