import type { FuelType } from "@/components/fuel/fuel";
import { publicVoucherUrl } from "@/lib/publicUrl";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  Check,
  Copy,
  Link2,
  MessageCircle,
  Plus,
  Search,
  Send,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cardsOfFuel, issuancePool } from "@/lib/issuanceStock";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { PageHero } from "@/components/ui/PageHero";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import {
  fullName,
  groupStock,
  useAppStore,
  useCurrentUser,
  type B2BClientRecord,
  type ClientRecord,
  type WorkerIssueItem,
} from "@/store/appStore";
import { ProducedLinks } from "@/components/production/ProducedLinks";
import { issuanceAmountRules, issuanceAmountError, STOCK_SHORTAGE } from "@/lib/issuanceInventory";
import { useLiveInventory } from "@/lib/useLiveInventory";
import { pickExact } from "@/store/appStore";
import { isActiveClient } from "@/lib/importIntegrity";
import { workVehicleKey } from "@/lib/workVehicles";
import { api } from "@/lib/apiClient";
import { NoAccess } from "@/components/layout/NoAccess";
import { cardsText, fieldBadClass, fieldClass, labelClass } from "@/components/allocations/AllocationForm";

export const Route = createFileRoute("/supervisor")({
  head: () => ({
    meta: [
      { title: "הפקת שוברי דלק | רשף ביטחון" },
      {
        name: "description",
        content: "הפקת לינק שוברי דלק לעובד — רכב עבודה או רכב פרטי.",
      },
      { property: "og:title", content: "הפקת שוברי דלק | רשף ביטחון" },
      { property: "og:description", content: "הפקת לינק שוברי דלק לעובד לרכב עבודה או רכב פרטי." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupervisorPage,
});

type Mode = "b2b" | "regular";

interface Block {
  key: number;
  mode: Mode;
  search: string;
  b2b: B2BClientRecord | null;
  regular: ClientRecord | null;
  amount: string;
  reason: string;
  fuelType: FuelType | "";
}

let blockSeq = 1;
const newBlock = (mode: Mode = "b2b"): Block => ({
  key: blockSeq++, mode, search: "", b2b: null, regular: null, amount: "", reason: "", fuelType: "",
});

const fmt = (n: number) => n.toLocaleString("he-IL");
const fuelWord = (f: FuelType) => (f === "בנזין" ? "בנזין 95" : "סולר");
const b2bSub = (c: B2BClientRecord) => [c.accountName, c.standard && `תקן ${c.standard}`, c.clientCode && `קוד ${c.clientCode}`].filter(Boolean).join(" · ");
const regularSub = (c: ClientRecord) => [c.siteName, c.siteId && `אתר ${c.siteId}`, c.clientId && `לקוח ${c.clientId}`].filter(Boolean).join(" · ");

/** Per-block live stock view (display only; mirrors the stockError consumption order). */
interface BlockStock {
  avail: number | null;
  pick: { amount: number }[] | null;
  error: string | null;
}

interface IssuedResult { url: string; name: string; total: number; codes: number }

function SupervisorPage() {
  // Issuing is a write action; the read-only viewer has no access to this screen.
  const role = useAppStore((s) => s.role);
  if (role === "viewer") return <NoAccess title="הפקת שוברי דלק" />;
  return <SupervisorIssuePage />;
}

function SupervisorIssuePage() {
  const role = useAppStore((s) => s.role);
  const issueWorkerVoucher = useAppStore((s) => s.issueWorkerVoucher);
  const me = useCurrentUser();
  const stockReady = useLiveInventory();
  const stock = useAppStore(s => s.vouchers);

  const [employeeName, setEmployeeName] = useState("");
  const [blocks, setBlocks] = useState<Block[]>(() => [newBlock()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [issued, setIssued] = useState<IssuedResult | null>(null);
  const [copied, setCopied] = useState(false);

  const pool = useMemo(
    () => issuancePool(stock, { role, branch: me?.branch, supervisorName: me ? fullName(me) : undefined }),
    [stock, role, me],
  );
  const stockError = useMemo(() => {
    let remaining = pool;
    for (const block of blocks) {
      if (!block.fuelType || !Number(block.amount) || issuanceAmountError(block.fuelType, Number(block.amount))) continue;
      const picked = pickExact(cardsOfFuel(remaining, block.fuelType), Number(block.amount));
      if (!picked) return STOCK_SHORTAGE;
      const ids = new Set(picked.map(v => v.serial));
      remaining = remaining.filter(v => !ids.has(v.serial));
    }
    return null;
  }, [pool, blocks]);
  const blockStock = useMemo<BlockStock[]>(() => {
    let remaining = pool;
    return blocks.map((block) => {
      if (!block.fuelType) return { avail: null, pick: null, error: null };
      const cards = cardsOfFuel(remaining, block.fuelType);
      const avail = cards.reduce((t, v) => t + v.amount, 0);
      const raw = block.amount.trim();
      if (!raw) return { avail, pick: null, error: null };
      const n = Number(raw);
      const amountError = issuanceAmountError(block.fuelType, n);
      if (amountError) return { avail, pick: null, error: amountError };
      if (n > avail) return { avail, pick: null, error: `חורג מהמלאי שלי (${fmt(avail)} ₪)` };
      const picked = pickExact(cards, n);
      if (!picked) return { avail, pick: null, error: `${STOCK_SHORTAGE}. המלאי הזמין: ${groupStock(cards)}.` };
      const ids = new Set(picked.map((v) => v.serial));
      remaining = remaining.filter((v) => !ids.has(v.serial));
      return { avail, pick: picked, error: null };
    });
  }, [pool, blocks]);
  // Any field change clears stale validation from the previous attempt.
  useEffect(() => { setError(null); }, [employeeName, blocks]);

  const patch = (key: number, p: Partial<Block>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...p } : b)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    toast.dismiss();
    setError(null);
    if (!me) return setError("לא נמצא משתמש מחובר");
    if (employeeName.trim().length < 2) return setError("יש למלא שם עובד");
    const items: WorkerIssueItem[] = [];
    for (const [i, b] of blocks.entries()) {
      const n = Number(b.amount);
      const sel = b.mode === "b2b" ? b.b2b : b.regular;
      if (!sel || !n || !b.reason) return setError(`לקוח ${i + 1}: יש לבחור לקוח, למלא סכום ולבחור סיבה`);
      if (!b.fuelType) return setError(`לקוח ${i + 1}: יש לבחור סוג דלק`);
      const fuelType = b.fuelType;
      const amountError = issuanceAmountError(fuelType, n);
      if (amountError) return setError(`לקוח ${i + 1}: ${amountError}`);
      if (b.mode === "b2b" && b.b2b) items.push({ amount: n, fuelType, reason: b.reason, route: "b2b", clientName: b.b2b.clientName, clientCode: b.b2b.clientCode, accountName: b.b2b.accountName, standard: b.b2b.standard });
      else if (b.regular) items.push({ amount: n, fuelType, reason: b.reason, route: "regular", clientName: b.regular.clientName, clientCode: b.regular.clientId, siteId: b.regular.siteId, siteName: b.regular.siteName, ...(b.regular.standard ? { standard: b.regular.standard } : {}) });
    }
    setError(null);
    setLoading(true);
    try {
      const name = employeeName.trim();
      const created = await issueWorkerVoucher({
        employeeName: name,
        branch: me.branch || "הנהלה",
        ...(role === "supervisor" ? { supervisor: fullName(me) } : {}),
        requester: fullName(me),
        items,
      });
      if ("error" in created) {
        setError(created.error);
        toast.error(created.error);
        return;
      }
      setIssued({ url: publicVoucherUrl(created.id), name, total: items.reduce((t, it) => t + it.amount, 0), codes: created.serials.length });
      setCopied(false);
      setEmployeeName("");
      setBlocks([newBlock()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפקת הלינק נכשלה");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
      toast.success("הלינק הועתק — ניתן להדביק בוואטסאפ");
    } catch {
      toast.error("ההעתקה נכשלה, יש להעתיק ידנית");
    }
  }

  // ---- summary (display only) ----
  const nameOk = employeeName.trim().length >= 2;
  const multi = blocks.length > 1;
  const missing: string[] = [];
  if (!nameOk) missing.push("שם עובד");
  const totals = { "בנזין": 0, "סולר": 0 } as Record<FuelType, number>;
  const used = { "בנזין": [] as { amount: number }[], "סולר": [] as { amount: number }[] };
  blocks.forEach((b, i) => {
    const tag = multi ? `לקוח ${i + 1}: ` : "";
    const sel = b.mode === "b2b" ? b.b2b : b.regular;
    const s = blockStock[i];
    if (!sel) missing.push(tag + (b.mode === "b2b" ? "רכב / לקוח" : "לקוח / אתר"));
    if (!b.fuelType) missing.push(tag + "סוג דלק");
    else if (!s?.pick && !s?.error) missing.push(tag + "סכום");
    if (!b.reason) missing.push(tag + "סיבת הנפקה");
    if (b.fuelType && s?.pick) {
      totals[b.fuelType] += Number(b.amount);
      used[b.fuelType].push(...s.pick);
    }
  });
  const anyBlockError = blockStock.some((s) => s.error);
  const total = totals["בנזין"] + totals["סולר"];
  const ready = nameOk && missing.length === 0 && !anyBlockError && total > 0;
  const usedText = (["בנזין", "סולר"] as const).filter((f) => totals[f] > 0).map((f) => `${f}: ${cardsText(used[f])}`).join(" · ");
  const myStock = { "בנזין": cardsOfFuel(pool, "בנזין").reduce((t, v) => t + v.amount, 0), "סולר": cardsOfFuel(pool, "סולר").reduce((t, v) => t + v.amount, 0) };
  const waText = issued ? `שלום ${issued.name}, זה הלינק לשוברי הדלק שלך: ${issued.url}` : "";

  return (
    <InternalLayout title="הפקת שוברי דלק">
      <PageHero
        eyebrow="הנפקה"
        title="הנפקה לעובד"
        subtitle="לינק חד־פעמי עם שוברי דלק לעובד."
        actions={
          <Link to="/produced" className="ds-btn ds-btn-glass">
            <Link2 className="size-4" aria-hidden />
            שוברים שהופקו
          </Link>
        }
      />

      <form onSubmit={submit} noValidate className="grid items-start gap-[18px] min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="טופס הנפקה" className="ds-card flex min-w-0 flex-col gap-5 px-[22px] pb-6 pt-[22px] max-[899.98px]:px-4">
          <div className="flex flex-col gap-3">
            <h2 className="m-0 text-[17px] font-extrabold text-navy-900">פרטי העובד</h2>
            <label className={cn(labelClass, "max-w-[420px]")}>
              שם עובד
              <input
                className={fieldClass}
                type="text"
                autoComplete="off"
                placeholder="שם מלא של העובד"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                required
              />
              <span className="text-[12.5px] font-medium text-slate-600">השם יופיע מראש בלינק — העובד יאמת עם ת.ז וטלפון</span>
            </label>
          </div>

          <div className="flex flex-col gap-3.5 border-t border-table-line pt-[18px]">
            <h2 className="m-0 text-[17px] font-extrabold text-navy-900">לקוחות ואתרים</h2>
            {blocks.map((b, i) => (
              <ClientBlock
                key={b.key}
                index={i}
                block={b}
                stockInfo={blockStock[i]}
                role={role}
                branch={me?.branch}
                onChange={(p) => patch(b.key, p)}
                onRemove={blocks.length > 1 ? () => setBlocks((bs) => bs.filter((x) => x.key !== b.key)) : undefined}
              />
            ))}
            <button
              type="button"
              onClick={() => setBlocks((bs) => [...bs, newBlock()])}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[#9dbbef] bg-[#f7faff] text-[14.5px] font-bold text-blue-500 hover:bg-[#eef4ff] focus-visible:shadow-focus-mint focus-visible:outline-none"
            >
              <Plus className="size-[18px]" aria-hidden />
              הוסף לקוח / אתר
            </button>
          </div>
        </section>

        <aside aria-label="סיכום הנפקה" className="ds-card flex flex-col gap-3.5 p-5 min-[1100px]:sticky min-[1100px]:top-5">
          <div className="flex items-center justify-between gap-2.5">
            <h2 className="m-0 text-[17px] font-extrabold text-navy-900">סיכום הנפקה</h2>
            <span className={cn("rounded-full px-2.5 py-[3px] text-xs font-bold", ready ? "bg-[#e8f0fd] text-blue-700" : "bg-[#f1f3f7] text-ink-soft")}>
              {ready ? "מוכן להפקה" : "טיוטה"}
            </span>
          </div>
          <div className="flex flex-col">
            <div className="ds-kv border-b border-table-line py-[9px]">
              <span>עובד</span>
              <span className={nameOk ? "font-semibold text-navy-900" : "text-slate-600"}>{nameOk ? employeeName.trim() : "—"}</span>
            </div>
            {blocks.map((b, i) => {
              const sel = b.mode === "b2b" ? b.b2b : b.regular;
              const s = blockStock[i];
              const has = !!(b.fuelType && s?.pick);
              return (
                <div key={b.key} className="ds-kv border-b border-table-line py-[9px]">
                  <span className="min-w-0">{i + 1} · {sel ? sel.clientName : "—"}</span>
                  <span className={cn("ds-num whitespace-nowrap", has ? "font-semibold text-navy-900" : "text-slate-600")}>
                    {has && b.fuelType ? `${fmt(Number(b.amount))} ₪ ${fuelWord(b.fuelType)}` : "—"}
                  </span>
                </div>
              );
            })}
            {(["בנזין", "סולר"] as const).filter((f) => totals[f] > 0).map((f) => (
              <div key={f} className="ds-kv border-b border-table-line py-[9px]">
                <span className="font-bold text-navy-900">סה״כ {fuelWord(f)}</span>
                <span className="ds-num font-bold text-navy-900">{fmt(totals[f])} ₪</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 rounded-[14px] bg-shell px-4 py-3.5 text-white">
            <span className="text-[12.5px] text-shell-text">סה״כ לעובד</span>
            <span className="ds-num text-[26px] font-semibold">{fmt(total)} ₪</span>
            <span className="ds-num text-[12.5px] leading-relaxed text-mint-300">{usedText || "טרם הוזן סכום"}</span>
          </div>
          {missing.length ? (
            <span className="text-[12.5px] leading-relaxed text-slate-600">חסר: {missing.join(" · ")}</span>
          ) : anyBlockError ? (
            <span className="text-[12.5px] font-bold leading-relaxed text-red-700">יש לתקן את הסכומים המסומנים</span>
          ) : null}
          {error || stockError ? <p role="alert" className="m-0 text-sm font-semibold text-red-700">{error ?? stockError}</p> : null}
          <button type="submit" className="ds-btn ds-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={loading || !stockReady || !!stockError} aria-busy={loading}>
            <Send className="size-4" aria-hidden />
            {loading ? "מפיק לינק…" : "הפקת לינק לעובד"}
          </button>
          <span className="ds-num text-center text-xs text-slate-600">
            {stockReady ? `המלאי שלי · בנזין 95: ${fmt(myStock["בנזין"])} ₪ · סולר: ${fmt(myStock["סולר"])} ₪` : "טוען מלאי…"}
          </span>
        </aside>
      </form>

      <section aria-label="שוברים אחרונים שהופקו" className="ds-card flex flex-col gap-1 px-[22px] py-5 max-[899.98px]:px-4">
        <div className="flex items-center justify-between gap-2.5 pb-2">
          <h2 className="m-0 text-[17px] font-bold text-navy-900">שוברים אחרונים שהופקו</h2>
          <Link to="/produced" className="px-1 py-3 text-[13px] font-semibold text-blue-500 no-underline hover:text-blue-700">לכל הרשימה</Link>
        </div>
        <ProducedLinks limit={10} variant="compact" />
      </section>

      <Modal
        open={!!issued}
        onClose={() => setIssued(null)}
        title="הלינק הופק"
        description={issued ? `הופקו ${issued.codes} קודים בסך ${fmt(issued.total)} ₪ עבור ${issued.name}` : undefined}
        footer={<button type="button" className="ds-btn ds-btn-light" onClick={() => setIssued(null)}>הנפקה נוספת</button>}
      >
        {issued ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 rounded-[14px] border-2 border-dashed border-blue-500 bg-[#f2f6fe] p-4 text-center">
              <span className="text-[12.5px] font-bold text-slate-600">לינק אישי לעובד</span>
              <span dir="ltr" className="ds-num break-all text-[17px] font-semibold text-shell-2">{issued.url}</span>
            </div>
            <div className="grid gap-2.5 min-[600px]:grid-cols-3">
              <button type="button" className="ds-btn ds-btn-primary" onClick={() => void copyLink()}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "הלינק הועתק" : "העתקת לינק"}
              </button>
              <a
                className="ds-btn bg-[#177a42] text-white no-underline hover:bg-[#11633a] hover:text-white"
                href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="size-4" aria-hidden />
                וואטסאפ
              </a>
              <a className="ds-btn ds-btn-light no-underline" href={issued.url} target="_blank" rel="noopener noreferrer">
                <SquareArrowOutUpRight className="size-4" aria-hidden />
                צפייה בעמוד העובד
              </a>
            </div>
          </div>
        ) : null}
      </Modal>
    </InternalLayout>
  );
}

function Seg<T extends string>({ label, options, value, onPick }: { label: string; options: readonly (readonly [T, string])[]; value: T | ""; onPick: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#f1f4f9] p-1">
      {options.map(([v, text]) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => { if (!on) onPick(v); }}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-[9px] text-sm font-bold focus-visible:shadow-focus-mint focus-visible:outline-none",
              on ? "bg-white text-blue-700 shadow-[0_1px_3px_rgba(11,17,64,.14)]" : "bg-transparent text-slate-600",
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

function ClientBlock({
  index, block, stockInfo, role, branch, onChange, onRemove,
}: {
  index: number;
  block: Block;
  stockInfo?: BlockStock;
  role: string;
  branch?: string;
  onChange: (p: Partial<Block>) => void;
  onRemove?: () => void;
}) {
  const b2bClients = useAppStore((s) => s.b2bClients);
  const nonB2b = useAppStore((s) => s.nonB2bClients);
  const reasons = useAppStore((s) => s.reasons);
  const { mode, search, b2b, regular } = block;
  const [activeKeys, setActiveKeys] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    setActiveKeys(null);
    const table = mode === "b2b" ? "b2b_clients" : "regular_clients";
    const columns = mode === "b2b" ? "client_code,standard" : "client_id,site_id";
    void (async () => {
      const keys = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await api.from(table).select(columns).eq("is_active", true).range(from, from + 999);
        if (error) throw error;
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) keys.add(mode === "b2b" ? workVehicleKey({ clientCode: String(row.client_code ?? ""), standard: String(row.standard ?? "") }) : JSON.stringify([row.client_id, row.site_id]));
        if (!data || data.length < 1000) break;
      }
      if (!cancelled) setActiveKeys(keys);
    })().catch(() => { /* Fail closed; inactive or unverified clients are never offered. */ });
    return () => { cancelled = true; };
  }, [mode, b2bClients, nonB2b]);
  const verifiedActive = (c: B2BClientRecord | ClientRecord) => isActiveClient(c) && Boolean(activeKeys?.has("accountName" in c ? workVehicleKey(c) : JSON.stringify([c.clientId,c.siteId])));

  // Only active clients are offered.
  const allowedB2b = useMemo(
    () => b2bClients.filter((c) => verifiedActive(c) && (role === "admin" || c.branch === branch)),
    [b2bClients, role, branch, activeKeys],
  );
  const modeReasons = reasons.filter((r) => r.category === (mode === "b2b" ? "B2B" : "Regular"));
  const selected = mode === "b2b" ? b2b : regular;
  const amountRules = issuanceAmountRules(block.fuelType);

  const matches = useMemo(() => {
    if (selected) return [];
    const q = search.trim();
    if (mode === "b2b") return allowedB2b.filter((c) => !q || c.clientName.includes(q) || c.accountName.includes(q) || c.standard.includes(q) || c.clientCode.includes(q)).slice(0, 50);
    return nonB2b.filter((c) => verifiedActive(c) && (!q || c.clientName.includes(q) || c.siteName.includes(q))).slice(0, 50);
  }, [search, selected, mode, allowedB2b, nonB2b, activeKeys]);

  const searchLabel = mode === "b2b" ? "חיפוש רכב עבודה / לקוח" : "חיפוש לקוח / אתר";
  const n = index + 1;
  const amountId = `amount-${block.key}`;
  const reasonId = `reason-${block.key}`;

  return (
    <article aria-label={`לקוח ${n}`} className="flex flex-col gap-3.5 rounded-card border border-[#dfe6f1] bg-white p-4 shadow-[0_1px_2px_rgba(11,17,64,.04)]">
      <div className="flex min-h-11 items-center justify-between gap-2.5">
        <span className="inline-flex min-w-0 items-center gap-2.5 text-[15px] font-extrabold text-shell-2">
          <span className="ds-num inline-grid size-7 flex-none place-items-center rounded-lg bg-[#e8f0fd] text-[13px] text-blue-700">{n}</span>
          <span className="truncate">{selected ? selected.clientName : `לקוח ${n}`}</span>
        </span>
        {onRemove ? (
          <button type="button" aria-label={`הסרת לקוח ${n}`} onClick={onRemove} className="ds-iconbtn border-[#f3c3c9] text-red-700 hover:bg-[#fdf2f3]">
            <Trash2 className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <Seg
        label="סוג רכב"
        options={[["b2b", "רכב עבודה"], ["regular", "רכב פרטי"]] as const}
        value={mode}
        onPick={(value) => onChange({ mode: value, search: "", b2b: null, regular: null, reason: "" })}
      />

      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500 bg-[#eef4ff] px-3 py-2.5">
          <span className="grid size-[38px] flex-none place-items-center rounded-[10px] bg-white text-blue-500">
            <Building2 className="size-[18px]" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14.5px] font-bold leading-snug text-navy-900">{selected.clientName}</span>
            <span className="text-[12.5px] leading-normal text-slate-600">
              {mode === "b2b" && b2b ? b2bSub(b2b) : regular ? regularSub(regular) : ""}
            </span>
          </span>
          <button type="button" className="ds-rowact min-h-11" onClick={() => onChange({ b2b: null, regular: null, search: "" })}>החלפה</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="relative block">
            <span className="sr-only">{searchLabel}</span>
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" aria-hidden />
            <input
              type="search"
              className={cn(fieldClass, "pr-9")}
              placeholder={mode === "b2b" ? "חיפוש לפי לקוח, חשבון או תקן" : "חיפוש לפי לקוח או אתר"}
              value={search}
              onChange={(e) => onChange({ search: e.target.value, b2b: null, regular: null })}
            />
          </label>
          <div role="listbox" aria-label={searchLabel} className="ds-scroll flex max-h-[262px] flex-col gap-1.5 overflow-y-auto p-0.5">
            {matches.map((c) => {
              const isB2b = "accountName" in c;
              return (
                <button
                  key={isB2b ? workVehicleKey(c) : `${(c as ClientRecord).clientId}|${(c as ClientRecord).siteId}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => onChange(isB2b ? { b2b: c, search: "" } : { regular: c as ClientRecord, search: "" })}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-start text-navy-900 hover:border-slate-400 focus-visible:shadow-focus-mint focus-visible:outline-none"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14.5px] font-bold leading-snug">{c.clientName}</span>
                    <span className="text-[12.5px] leading-normal text-slate-600">{isB2b ? b2bSub(c) : regularSub(c as ClientRecord)}</span>
                  </span>
                </button>
              );
            })}
            {matches.length === 0 ? (
              <span className="px-1 py-2.5 text-[13px] text-slate-600">{activeKeys ? "לא נמצאו תוצאות." : "טוען לקוחות…"}</span>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid items-start gap-3.5 rounded-xl border border-line bg-[#f4f7fc] p-3.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <div className={labelClass}>
          <span id={`fuel-${block.key}`}>סוג דלק</span>
          <Seg
            label={`סוג דלק ללקוח ${n}`}
            options={[["בנזין", "בנזין 95"], ["סולר", "סולר"]] as const}
            value={block.fuelType}
            onPick={(value) => onChange({ fuelType: value })}
          />
        </div>
        <div className={labelClass}>
          <label htmlFor={amountId}>סכום (₪)</label>
          <input
            id={amountId}
            type="number"
            inputMode="numeric"
            min={amountRules.min}
            step={amountRules.step}
            placeholder="0"
            value={block.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            aria-invalid={stockInfo?.error ? true : undefined}
            className={cn(fieldClass, "ds-num", stockInfo?.error && fieldBadClass)}
          />
          <span className="text-[12.5px] font-medium text-slate-600">
            {block.fuelType && stockInfo?.avail != null ? `זמין לי: ${fmt(stockInfo.avail)} ₪ · ${amountRules.hint}` : "יש לבחור סוג דלק"}
          </span>
          {stockInfo?.error ? <span role="alert" className="text-[12.5px] font-bold text-red-700">{stockInfo.error}</span> : null}
          {stockInfo?.pick ? <span className="ds-num text-[12.5px] font-semibold text-available-fg">ייבחרו: {cardsText(stockInfo.pick)}</span> : null}
        </div>
        <div className={labelClass}>
          <label htmlFor={reasonId}>סיבת הנפקה</label>
          <select id={reasonId} className={fieldClass} value={block.reason} onChange={(e) => onChange({ reason: e.target.value })}>
            <option value="">בחירה…</option>
            {modeReasons.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>
    </article>
  );
}
