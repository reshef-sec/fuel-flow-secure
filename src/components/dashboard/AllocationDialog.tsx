import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { ResultDialog, type ResultSummary } from "@/components/ui/ResultDialog";
import { AdminAllocationForm } from "@/components/allocations/AdminAllocationForm";
import { useLiveInventory } from "@/lib/useLiveInventory";
import { useCentralInventorySummary } from "@/lib/useCentralInventorySummary";

/**
 * Admin allocation in a dialog (used from the dashboard voucher table). Same props as before;
 * the form + submit logic live in AdminAllocationForm (shared with the /allocations page).
 */
export function AllocationDialog({
  open,
  onClose,
  presetTarget,
  onAllocated,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-selected branch name, used by the quick-allocate action on branch cards. */
  presetTarget?: string;
  onAllocated?: () => Promise<unknown>;
}) {
  const { summary, error: inventoryError, refresh } = useCentralInventorySummary(open);
  const stockReady = useLiveInventory(open);
  const [result, setResult] = useState<ResultSummary | null>(null);

  return (
    <>
      <Modal open={open} onClose={onClose} title="הקצאה חדשה" description="הקצאה מהמאגר המרכזי למנהלי סניפים ולמורשי דרישה." size="lg">
        <AdminAllocationForm
          active={open}
          summary={summary}
          inventoryError={inventoryError}
          refresh={refresh}
          stockReady={stockReady}
          presetTarget={presetTarget}
          onAllocated={onAllocated}
          onCancel={onClose}
          idPrefix="alloc-dialog"
          onDone={(r) => {
            if (r.tone === "success") onClose();
            setResult(r);
          }}
        />
      </Modal>
      <ResultDialog result={result} onClose={() => setResult(null)} />
    </>
  );
}
