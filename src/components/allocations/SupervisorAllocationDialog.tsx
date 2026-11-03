import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/Modal";
import { ResultDialog, type ResultSummary } from "@/components/ui/ResultDialog";
import { emptySplit, fuelOf, readSplit, type FuelType } from "@/components/fuel/fuel";
import { isAvailable } from "@/components/dashboard/voucherData";
import { fullName, groupStock, pickExact, useAppStore } from "@/store/appStore";
import { useLiveInventory } from "@/lib/useLiveInventory";
import { STOCK_SHORTAGE } from "@/lib/issuanceInventory";
import { branchLabel } from "@/lib/branchLabels";
import { AllocationFormFields, cardsText } from "./AllocationForm";

const fmt = (n: number) => n.toLocaleString("he-IL");
const fuelWord = (f: FuelType) => (f === "בנזין" ? "בנזין 95" : "סולר");

/**
 * Branch manager → supervisor of HIS branch. Permission/stock logic unchanged: only supervisors whose
 * branch equals the manager's branch are listed; stock = the branch's unassigned "טרם שומש" cards;
 * `assignToSupervisor(branch, supervisor, amount, fuel)` per fuel.
 */
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
  const stockReady = useLiveInventory(open);
  const assignToSupervisor = useAppStore((s) => s.assignToSupervisor);
  const allVouchers = useAppStore((s) => s.vouchers);
  const free = useMemo(
    () => allVouchers.filter((v) => v.branch === branch && !v.supervisor && isAvailable(v) && v.status === "טרם שומש"),
    [allVouchers, branch],
  );
  const pools = useMemo(() => ({ "בנזין": free.filter((v) => fuelOf(v) === "בנזין"), "סולר": free.filter((v) => fuelOf(v) === "סולר") }), [free]);
  const avail = { "בנזין": 0, "סולר": 0 } as Record<FuelType, number>;
  for (const v of free) avail[fuelOf(v)] += v.amount;

  const supervisors = users.filter((u) => u.role === "supervisor" && u.branch.trim() === branch.trim());
  const [supervisor, setSupervisor] = useState("");
  const [split, setSplit] = useState(emptySplit);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultSummary | null>(null);
  const currentSplit = readSplit(split);
  const stockError = typeof currentSplit === "string" ? null : (["בנזין", "סולר"] as const).some(f =>
    currentSplit[f] > 0 && !pickExact(free.filter(v => fuelOf(v) === f), currentSplit[f])) ? STOCK_SHORTAGE : null;

  useEffect(() => {
    if (!open) return;
    setSupervisor("");
    setSplit(emptySplit());
    setError(null);
    setLoading(false);
  }, [open]);
  useEffect(() => { setError(null); }, [supervisor, split]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = readSplit(split);
    if (!supervisor) return setError("יש לבחור מפקח");
    if (typeof parsed === "string") return setError(parsed);
    const numeric = parsed["בנזין"] + parsed["סולר"];
    const cards: string[] = [];
    for (const f of ["בנזין", "סולר"] as const)
      if (parsed[f]) {
        const stock = free.filter((v) => fuelOf(v) === f);
        const pick = pickExact(stock, parsed[f]);
        if (!pick)
          return setError(`אין במלאי שוברי ${f} בסכום זה. המלאי הזמין כעת בסוג דלק זה: ${groupStock(stock)}.`);
        cards.push(`${fuelWord(f)}: ${cardsText(pick)}`);
      }
    if (numeric > branchBalance) {
      setError("הסכום גבוה מהיתרה הזמינה בסניף");
      return;
    }
    setError(null);
    setLoading(true);
    const done: string[] = [];
    try {
      for (const f of ["בנזין", "סולר"] as const) if (parsed[f]) {
        const error = await assignToSupervisor(branch, supervisor, parsed[f], f);
        if (error) {
          if (done.length) {
            setSplit((s) => ({ ...s, "בנזין": "" }));
            setResult({ tone: "warning", title: "ההקצאה בוצעה חלקית", line: `הועברו ${done.join(" ו-")} ל${supervisor}. ${fuelWord(f)} לא הועבר: ${error}` });
          }
          setError(error); toast.error(error); return;
        }
        done.push(`${fmt(parsed[f])} ₪ ${fuelWord(f)}`);
      }
      onClose();
      setResult({ tone: "success", title: "ההקצאה בוצעה", line: `הועברו ${done.join(" ו-")} ל${supervisor}`, detail: cards.join(" · ") || undefined });
    } finally { setLoading(false); }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="הקצאה למפקח" description={`הקצאה מהיתרה שלך למפקחי סניף ${branchLabel(branch)}.`} size="lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
          <p className="m-0 rounded-[14px] border border-line bg-[#fbfcfe] px-4 py-3 text-sm text-slate-600">
            היתרה שלי: <span className="ds-num font-bold text-navy-900">{fmt(branchBalance)} ₪</span>
            <span className="mx-1.5">·</span>בנזין 95 <span className="ds-num font-semibold text-navy-900">{fmt(avail["בנזין"])} ₪</span>
            <span className="mx-1.5">·</span>סולר <span className="ds-num font-semibold text-navy-900">{fmt(avail["סולר"])} ₪</span>
          </p>
          <AllocationFormFields
            idPrefix="sup-alloc"
            recipientLabel={`מפקח בסניף ${branchLabel(branch)}`}
            recipientPlaceholder="בחירת מפקח…"
            recipients={supervisors.map((u) => ({ value: fullName(u), label: `${fullName(u)} · מפקח · ${branchLabel(u.branch)}` }))}
            recipient={supervisor}
            onRecipient={setSupervisor}
            emptyRecipientsNote="לא הוגדרו מפקחים לסניף זה. ניתן להוסיף מפקחים בהגדרות → ניהול משתמשים."
            values={split}
            onValues={setSplit}
            available={avail}
            pools={pools}
            availPrefix="זמין ביתרה שלי"
            overLabel="חורג מהיתרה שלך"
            error={error}
            fallbackError={stockError}
            loading={loading}
            submitDisabled={!stockReady || !!stockError || typeof currentSplit === "string" || !supervisor}
            onCancel={onClose}
          />
        </form>
      </Modal>
      <ResultDialog result={result} onClose={() => setResult(null)} />
    </>
  );
}
