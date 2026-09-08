import { useEffect, useState } from "react";
import { Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { Button, FormField, Input, Select } from "@/design-system/delek-1ea111";

const targets = ["סניף מרכז", "מפקח דן", "לקוח - אתר 1"];
const reasons = ["חידוש מלאי שוטף", "הקצאה חד פעמית", "סיור ניידות", "אירוע חריג"];

export function AllocationDialog({
  open,
  onClose,
  balance,
  onAllocate,
}: {
  open: boolean;
  onClose: () => void;
  balance: number;
  onAllocate: (amount: number) => void;
}) {
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget("");
    setAmount("");
    setReason("");
    setError(null);
    setLoading(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const numeric = Number(amount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !reason || !numeric) {
      setError("יש לבחור יעד, סיבה ולהזין סכום");
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
      onAllocate(numeric);
      onClose();
      toast.success("ההקצאה בוצעה בהצלחה והיתרה עודכנה");
    }, 1000);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        aria-label="סגור חלון"
        onClick={onClose}
        className="absolute inset-0 bg-navy-900/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="allocation-title"
        className="relative z-10 w-full max-w-lg rounded-xl bg-surface shadow-raised"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <h2 id="allocation-title" className="font-display text-lg font-extrabold text-secondary">
            הקצאת שוברים חדשה
          </h2>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
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
            <Select id="alloc-target" aria-label="בחר יעד הקצאה" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">בחר יעד…</option>
              {targets.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="סכום להקצאה (₪)">
            <Input
              id="alloc-amount"
              aria-label="סכום להקצאה"
              type="number"
              min={1}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1,000"
              className="tabular-nums"
            />
          </FormField>

          <FormField label="סיבת הנפקה">
            <Select id="alloc-reason" aria-label="סיבת הנפקה" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">בחר סיבה…</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
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
      </div>
    </div>
  );
}
