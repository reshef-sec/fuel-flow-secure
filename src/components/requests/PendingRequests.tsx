import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronLeft, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { DataTable, EmptyRow, KV, MobileCardList, TableCard } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { ResultDialog, type ResultSummary } from "@/components/ui/ResultDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fullName, roleLabels, useAppStore, useCurrentUser, type VoucherRequest } from "@/store/appStore";
import { useCentralInventorySummary } from "@/lib/useCentralInventorySummary";
import { branchLabel } from "@/lib/branchLabels";
import { formatIsraelDate } from "@/lib/israelDate";
import { FUEL_TYPES, fuelLabel, type FuelType } from "@/components/fuel/fuel";
import { SizePicker } from "@/components/allocations/SizePicker";
import { alternativeApproval, countsFromSizes, emptySizeCounts, fitsStock, fuelSizesAmount, readSizeCounts, sizesText, stockFromSummary, type FuelSizes } from "@/lib/allocationSizes";

const sizesLine = (sizes: FuelSizes) =>
  FUEL_TYPES.filter((f) => sizesText(sizes[f])).map((f: FuelType) => `${sizesText(sizes[f])} ${fuelLabel(f)}`).join(" ו־");

const ils = (n: number) => `${n.toLocaleString("he-IL")} ₪`;

/** "בנזין 95 300 ₪ · סולר 200 ₪" from the requested split, or "—" for legacy requests. */
function fuelSplit(r: VoucherRequest) {
  if (r.sizes) {
    const bySize = FUEL_TYPES.filter((f) => sizesText(r.sizes?.[f])).map((f) => `${fuelLabel(f)}: ${sizesText(r.sizes?.[f])}`);
    if (bySize.length) return bySize.join(" · ");
  }
  const parts = [
    r.benzineAmount ? `בנזין 95 ${ils(r.benzineAmount)}` : "",
    r.dieselAmount ? `סולר ${ils(r.dieselAmount)}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

const okBtn = "ds-btn min-h-10 rounded-[10px] px-[13px] text-[13px] bg-available-fg text-white hover:bg-[#08564b]";
const altBtn = "ds-btn min-h-10 rounded-[10px] px-[13px] text-[13px] border-[#9fdccf] bg-surface text-available-fg hover:bg-[#effaf7]";
const rejectBtn = "ds-btn min-h-10 rounded-[10px] px-[13px] text-[13px] border-[#f3c3c9] bg-surface text-redeemed-fg hover:bg-redeemed-bg";

/** Admin-only queue of voucher requests awaiting approval. */
export function PendingRequests({ readOnly = false }: { readOnly?: boolean } = {}) {
  const requests = useAppStore((s) => s.requests);
  const { summary, refresh } = useCentralInventorySummary();
  const approveRequest = useAppStore((s) => s.approveRequest);
  const rejectRequest = useAppStore((s) => s.rejectRequest);
  const me = useCurrentUser();
  const users = useAppStore((s) => s.users);
  const roleOf = (r: { requesterId: string; requester: string }) => {
    const u = users.find((x) => x.id === r.requesterId) ?? users.find((x) => fullName(x) === r.requester);
    return u ? u.title || roleLabels[u.role] : "—";
  };
  const approver = me ? fullName(me) : "אדמין מרכזי";

  const [customId, setCustomId] = useState<string | null>(null);
  const [customCounts, setCustomCounts] = useState(emptySizeCounts);
  const [customNote, setCustomNote] = useState<string | null>(null);
  const [result, setResult] = useState<ResultSummary | null>(null);
  const closeCustom = useCallback(() => setCustomId(null), []);
  const closeResult = useCallback(() => setResult(null), []);

  const pending = requests.filter((r) => r.status === "ממתין לאישור");
  const pendingSum = pending.reduce((t, r) => t + r.amount, 0);
  const customReq = pending.find((r) => r.id === customId) ?? null;
  const customStock = stockFromSummary(summary?.denominations);
  const customSelection = readSizeCounts(customCounts, customStock);
  const customTotal = typeof customSelection === "string" ? 0 : customSelection.split["בנזין"] + customSelection.split["סולר"];

  async function approve(id: string, amount: number, sizes?: FuelSizes) {
    if (amount % 50 !== 0 || amount <= 0) {
      toast.error("הסכום חייב להיות בכפולות של 50 ₪");
      return;
    }
    const req = requests.find((r) => r.id === id);
    if (!summary || amount > summary.total_available_amount) {
      if (summary && req) return offerAlternative(req);
      toast.error("הסכום גבוה מהיתרה הזמינה לחלוקה");
      return;
    }
    const outcome = await approveRequest(id, amount, approver, sizes);
    if (outcome === "short" && req) return offerAlternative(req);
    if (outcome !== "ok") return;
    setCustomId(null);
    setCustomCounts(emptySizeCounts());
    setResult({
      tone: "success",
      title: "הדרישה אושרה",
      line: `הדרישה אושרה והוקצו ${sizes ? sizesLine(sizes) : `${amount.toLocaleString("he-IL")} ₪`}`,
      detail: req ? `${req.requester} · ${branchLabel(req.branch)}` : undefined,
    });
  }

  function reject(r: VoucherRequest) {
    rejectRequest(r.id, approver);
    setResult({ tone: "info", title: "הדרישה נדחתה", line: `${r.requester} · ${branchLabel(r.branch)}`, detail: ils(r.amount) });
  }

  // Stock cannot supply the request as asked: nothing is allocated, and the admin picks from what exists.
  async function offerAlternative(r: VoucherRequest) {
    const fresh = await refresh().catch(() => summary);
    const cards = alternativeApproval(r, stockFromSummary(fresh?.denominations));
    const total = fuelSizesAmount(cards);
    setCustomCounts(countsFromSizes(cards));
    setCustomNote(
      total >= r.amount
        ? "אין במלאי את כל הגדלים שביקשו. הצענו שוברים אחרים באותו סכום, ואפשר לשנות אותם לפני האישור."
        : total > 0
          ? `מהמלאי אפשר להרכיב ${ils(total)} מתוך ${ils(r.amount)} שביקשו. אפשר לאשר את זה או לשנות.`
          : "אין כרגע במלאי שוברים מסוג הדלק שביקשו.",
    );
    setCustomId(r.id);
  }

  function openCustom(r: VoucherRequest) {
    if (r.sizes && summary && !fitsStock(r.sizes, customStock)) return void offerAlternative(r);
    // Opens with what was requested; the admin changes it to what exists.
    setCustomCounts(countsFromSizes(r.sizes ?? alternativeApproval(r, customStock)));
    setCustomNote(null);
    setCustomId(r.id);
  }

  const actions = (r: VoucherRequest, mobile = false) =>
    readOnly ? (
      <span className="text-slate-600">—</span>
    ) : (
      <div className={mobile ? "grid grid-cols-2 gap-2" : "flex gap-2"}>
        <button type="button" className={`${okBtn} ${mobile ? "col-span-2 min-h-11" : ""}`} onClick={() => approve(r.id, r.amount)} aria-label={`אישור ${ils(r.amount)} ל${r.requester}`}>
          <Check className="size-[15px]" strokeWidth={2.4} aria-hidden />
          אישור הסכום
        </button>
        <button type="button" className={`${altBtn} ${mobile ? "min-h-11" : ""}`} onClick={() => openCustom(r)} aria-label={`אישור סכום אחר ל${r.requester}`}>
          <Pencil className="size-[15px]" aria-hidden />
          אשר סכום אחר
        </button>
        <button type="button" className={`${rejectBtn} ${mobile ? "min-h-11" : ""}`} onClick={() => reject(r)} aria-label={`דחיית הדרישה של ${r.requester}`}>
          <X className="size-[15px]" strokeWidth={2.4} aria-hidden />
          דחייה
        </button>
      </div>
    );

  const header = (
    <>
      <div className="flex flex-col gap-[3px]">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 text-[17px] font-bold text-navy-900">דרישות שוברים ממתינות לאישור</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${pending.length ? "bg-pending-bg text-pending-fg" : "bg-neutral-bg text-neutral-fg"}`}>
            {pending.length} ממתינות
          </span>
        </div>
        <span className="text-[12.5px] text-slate-600">אישור דרישה מקצה את הסכום מהמאגר המרכזי לסניף הדורש</span>
      </div>
      <span className="text-[13px] text-slate-600">
        סה"כ ממתין: <span className="ds-num font-bold text-navy-900">{ils(pendingSum)}</span>
      </span>
    </>
  );

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Link to="/vouchers" className="inline-flex min-h-11 items-center gap-1 px-1 text-[13px] font-semibold text-primary no-underline hover:text-blue-700">
        לטבלת השוברים המלאה
        <ChevronLeft className="size-3.5" aria-hidden />
      </Link>
    </div>
  );

  return (
    <>
      <TableCard label="דרישות ממתינות לאישור" toolbar={header} footer={footer} className="scroll-mt-6">
        <DataTable minWidth={1180} maxHeight={440} caption="דרישות ממתינות לאישור">
          <thead>
            <tr>
              <th scope="col">דורש</th>
              <th scope="col">סניף</th>
              <th scope="col">תפקיד</th>
              <th scope="col">סכום מבוקש</th>
              <th scope="col">סוג דלק</th>
              <th scope="col">סיבה</th>
              <th scope="col">הוגש</th>
              <th scope="col">סטטוס</th>
              <th scope="col">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 ? (
              <EmptyRow colSpan={9}>אין דרישות ממתינות לאישור</EmptyRow>
            ) : (
              pending.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.requester}</td>
                  <td>{branchLabel(r.branch)}</td>
                  <td className="text-slate-600">{roleOf(r)}</td>
                  <td><span className="ds-num font-semibold">{ils(r.amount)}</span></td>
                  <td className="text-ink-soft">{fuelSplit(r)}</td>
                  <td className="min-w-[120px] text-slate-600">{r.reason || "—"}</td>
                  <td><span className="ds-num text-ink-soft">{r.createdAt ? formatIsraelDate(r.createdAt) : "—"}</span></td>
                  <td><StatusBadge status={r.status} size="sm" /></td>
                  <td>{actions(r)}</td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <MobileCardList
          items={pending}
          keyOf={(r) => r.id}
          empty="אין דרישות ממתינות לאישור"
          render={(r) => (
            <>
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[15px] font-bold">{r.requester}</span>
                <StatusBadge status={r.status} size="sm" />
              </div>
              <span className="ds-num text-[17px] font-bold">{ils(r.amount)}</span>
              <KV label="סניף · תפקיד">{branchLabel(r.branch)} · {roleOf(r)}</KV>
              <KV label="סוג דלק">{fuelSplit(r)}</KV>
              <KV label="סיבה">{r.reason || "—"}</KV>
              <KV label="הוגש"><span className="ds-num">{r.createdAt ? formatIsraelDate(r.createdAt) : "—"}</span></KV>
              {actions(r, true)}
            </>
          )}
        />
      </TableCard>

      <Modal open={!!customReq} onClose={closeCustom} title={customNote ? "בחירת שוברים מהמלאי הקיים" : "אישור סכום אחר"} size="lg">
        {customReq ? (
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (typeof customSelection === "string") return void toast.error(customSelection);
              void approve(customReq.id, customSelection.split["בנזין"] + customSelection.split["סולר"], customSelection.sizes);
            }}
          >
            <div className="flex flex-col gap-2 rounded-xl border border-table-line bg-table-head px-3.5 py-3">
              <KV label="דורש"><span className="font-semibold">{customReq.requester} · {branchLabel(customReq.branch)}</span></KV>
              <KV label="סכום מבוקש"><span className="ds-num font-bold">{ils(customReq.amount)}</span></KV>
              <KV label="סוג דלק">{fuelSplit(customReq)}</KV>
            </div>
            {customNote ? <p role="status" className="m-0 rounded-lg bg-pending-bg px-3 py-2 text-sm font-semibold text-pending-fg">{customNote}</p> : null}
            <SizePicker idPrefix="approve" counts={customCounts} onCounts={setCustomCounts} stock={customStock} />
            <p className="m-0 text-sm text-slate-600">
              סה״כ לאישור: <span className="ds-num font-bold text-navy-900">{ils(customTotal)}</span> מתוך {ils(customReq.amount)} שביקשו
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="submit" className={`${okBtn} min-h-11`}>אישור בסכום זה</button>
              <button type="button" className="ds-btn ds-btn-light" onClick={closeCustom}>ביטול</button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ResultDialog result={result} onClose={closeResult} />
    </>
  );
}
