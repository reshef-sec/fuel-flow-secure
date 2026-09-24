import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button, FormField, Input, Select } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";

/** Lets an authorized user submit a voucher request for admin approval. */
export function RequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reasons = useAppStore((s) => s.reasons);
  const addRequest = useAppStore((s) => s.addRequest);
  const me = useCurrentUser();

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setReason("");
    setError(null);
  }, [open]);

  const numeric = Number(amount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!numeric || !reason) {
      setError("יש להזין סכום ולבחור סיבה");
      return;
    }
    if (numeric % 100 !== 0) {
      setError("הסכום חייב להיות בכפולות של 100 ₪");
      return;
    }
    if (!me) {
      setError("לא נמצא משתמש מחובר");
      return;
    }
    setError(null);
    addRequest({
      requester: fullName(me),
      requesterId: me.id,
      branch: me.branch,
      amount: numeric,
      reason,
    });
    onClose();
    toast.success("הדרישה נשלחה לאישור אדמין");
  }

  return (
    <Modal open={open} onClose={onClose} title="הגשת דרישת שוברים">
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-lg bg-surface-muted p-4 text-sm">
          <p className="font-semibold text-secondary">{me ? fullName(me) : "—"}</p>
          <p className="text-muted-foreground">סניף {me?.branch ?? "—"}</p>
        </div>

        <FormField label="סכום מבוקש (₪)" hint="בכפולות של 100 ₪ בלבד">
          <Input
            type="number"
            min={100}
            step={100}
            inputMode="numeric"
            aria-label="סכום מבוקש"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1,000"
            className="tabular-nums"
          />
        </FormField>

        <FormField label="סיבת הדרישה">
          <Select aria-label="סיבת הדרישה" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">בחר סיבה…</option>
            {reasons.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormField>

        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit">שליחת דרישה</Button>
        </div>
      </form>
    </Modal>
  );
}
