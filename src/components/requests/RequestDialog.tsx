import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormField, Textarea } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { FuelSplitFields, emptySplit, readSplit } from "@/components/fuel/fuel";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";
import { branchLabel } from "@/lib/branchLabels";

/** Lets an authorized user submit a voucher request for admin approval. */
export function RequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addRequest = useAppStore((s) => s.addRequest);
  const me = useCurrentUser();

  const [split, setSplit] = useState(emptySplit);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSplit(emptySplit());
    setReason("");
    setError(null);
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = readSplit(split);
    if (typeof parsed === "string") return setError(parsed);
    if (!reason.trim()) return setError("יש למלא את סיבת הדרישה");
    const numeric = parsed["בנזין"] + parsed["סולר"];
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
      benzineAmount: parsed["בנזין"],
      dieselAmount: parsed["סולר"],
      reason: reason.trim(),
    });
    onClose();
    toast.success("הדרישה נשלחה לאישור אדמין");
  }

  return (
    <Modal open={open} onClose={onClose} title="הגשת דרישת שוברים" description="הדרישה תישלח לאישור אדמין מרכזי">
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl border border-table-line bg-table-head px-3.5 py-3 text-sm">
          <p className="m-0 font-semibold text-navy-900">{me ? fullName(me) : "—"}</p>
          <p className="m-0 text-slate-600">סניף {me?.branch ? branchLabel(me.branch) : "—"}</p>
        </div>

        <FuelSplitFields values={split} onChange={setSplit} />

        <FormField label="סיבת הדרישה">
          <Textarea
            aria-label="סיבת הדרישה"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={3}
            placeholder="פרט את סיבת הדרישה…"
          />
        </FormField>

        {error ? <p role="alert" className="m-0 rounded-lg bg-redeemed-bg px-3 py-2 text-sm font-semibold text-redeemed-fg">{error}</p> : null}

        <div className="grid grid-cols-2 gap-2 pt-1 min-[900px]:flex min-[900px]:justify-end">
          <button type="button" className="ds-btn ds-btn-light" onClick={onClose}>
            ביטול
          </button>
          <button type="submit" className="ds-btn ds-btn-primary">שליחת דרישה</button>
        </div>
      </form>
    </Modal>
  );
}
