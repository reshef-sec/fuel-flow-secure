import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormField, Textarea } from "@/design-system/delek-1ea111";
import { Modal } from "@/components/ui/Modal";
import { SizePicker } from "@/components/allocations/SizePicker";
import { emptySizeCounts, readSizeCounts } from "@/lib/allocationSizes";
import { fullName, useAppStore, useCurrentUser } from "@/store/appStore";
import { branchLabel } from "@/lib/branchLabels";

/** Lets an authorized user submit a voucher request for admin approval. */
export function RequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addRequest = useAppStore((s) => s.addRequest);
  const me = useCurrentUser();

  const [counts, setCounts] = useState(emptySizeCounts);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCounts(emptySizeCounts());
    setReason("");
    setError(null);
  }, [open]);

  const selected = readSizeCounts(counts, null);
  const total = typeof selected === "string" ? 0 : selected.split["בנזין"] + selected.split["סולר"];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const selection = readSizeCounts(counts, null);
    if (typeof selection === "string") return setError(selection);
    const parsed = selection.split;
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
      sizes: selection.sizes,
      reason: reason.trim(),
    });
    onClose();
    toast.success("הדרישה נשלחה לאישור אדמין");
  }

  return (
    <Modal open={open} onClose={onClose} title="הגשת דרישת שוברים" description="בחרו כמה שוברים מכל גודל. האדמין יאשר לפי המלאי הקיים." size="lg">
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl border border-table-line bg-table-head px-3.5 py-3 text-sm">
          <p className="m-0 font-semibold text-navy-900">{me ? fullName(me) : "—"}</p>
          <p className="m-0 text-slate-600">סניף {me?.branch ? branchLabel(me.branch) : "—"}</p>
        </div>

        <SizePicker idPrefix="request" counts={counts} onCounts={setCounts} stock={null} />
        <p className="m-0 text-sm text-slate-600">
          סה״כ לדרישה: <span className="ds-num font-bold text-navy-900">{total.toLocaleString("he-IL")} ₪</span>
        </p>

        <FormField label="סיבת הדרישה (רשות)">
          <Textarea
            aria-label="סיבת הדרישה"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={3}
            placeholder="אפשר להשאיר ריק"
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
