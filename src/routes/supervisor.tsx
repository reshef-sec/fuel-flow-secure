import type { FuelType } from "@/components/fuel/fuel";
import { publicVoucherUrl } from "@/lib/publicUrl";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeCheck,
  Building2,
  Check,
  Copy,
  Hash,
  Link2,
  MapPin,
  Plus,
  Trash2,
  Search,
  Send,
  SquareArrowOutUpRight,
} from "lucide-react";
import { toast } from "sonner";

import { InternalLayout } from "@/components/layout/InternalLayout";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Select,
} from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import {
  fullName,
  useAppStore,
  useCurrentUser,
  type B2BClientRecord,
  type ClientRecord,
  type WorkerIssueItem,
} from "@/store/appStore";
import { ProducedLinks } from "@/components/production/ProducedLinks";
import { issuanceAmountRules, issuanceAmountError, STOCK_SHORTAGE } from "@/lib/issuanceInventory";
import { useLiveInventory } from "@/lib/useLiveInventory";
import { fuelOf } from "@/components/fuel/fuel";
import { centralPoolOf, pickExact } from "@/store/appStore";
import { isAvailable } from "@/components/dashboard/voucherData";

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

function SupervisorPage() {
  const role = useAppStore((s) => s.role);
  const issueWorkerVoucher = useAppStore((s) => s.issueWorkerVoucher);
  const me = useCurrentUser();
  const stockReady = useLiveInventory();
  const stock = useAppStore(s => s.vouchers);

  const [employeeName, setEmployeeName] = useState("");
  const [blocks, setBlocks] = useState<Block[]>(() => [newBlock()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const stockError = useMemo(() => {
    const pool = role === "admin" ? centralPoolOf(stock) : stock.filter(v => isAvailable(v)
      && v.status === "טרם שומש" && v.branch === me?.branch
      && (role === "supervisor" ? v.supervisor === (me ? fullName(me) : "") : !v.supervisor));
    let remaining = pool;
    for (const block of blocks) {
      if (!block.fuelType || !Number(block.amount) || issuanceAmountError(block.fuelType, Number(block.amount))) continue;
      const picked = pickExact(remaining.filter(v => fuelOf(v) === block.fuelType), Number(block.amount));
      if (!picked) return STOCK_SHORTAGE;
      const ids = new Set(picked.map(v => v.serial));
      remaining = remaining.filter(v => !ids.has(v.serial));
    }
    return null;
  }, [stock, role, me, blocks]);
  useEffect(() => { if (stockReady && stockError) toast.error(stockError); }, [stockReady, stockError]);

  const patch = (key: number, p: Partial<Block>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...p } : b)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      items.push(
        b.mode === "b2b" && b.b2b
          ? { amount: n, fuelType, reason: b.reason, route: "b2b", clientName: b.b2b.clientName, clientCode: b.b2b.clientCode, accountName: b.b2b.accountName, standard: b.b2b.standard }
          : { amount: n, fuelType, reason: b.reason, route: "regular", clientName: b.regular!.clientName, clientCode: b.regular!.clientId, siteId: b.regular!.siteId, siteName: b.regular!.siteName, ...(b.regular!.standard ? { standard: b.regular!.standard } : {}) },
      );
    }
    setError(null);
    setLoading(true);
    try {
      const created = await issueWorkerVoucher({
        employeeName: employeeName.trim(),
        branch: me?.branch || "הנהלה",
        ...(me ? { supervisor: fullName(me), requester: fullName(me) } : {}),
        items,
      });
      if ("error" in created) {
        setError(created.error);
        toast.error(created.error);
        return;
      }
      setLink(publicVoucherUrl(created.id));
      setCopied(false);
      setEmployeeName("");
      setBlocks([newBlock()]);
      toast.success(`הופקו ${created.serials.length} קודים בלינק אחד`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפקת הלינק נכשלה");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("הלינק הועתק — ניתן להדביק בוואטסאפ");
    } catch {
      toast.error("ההעתקה נכשלה, יש להעתיק ידנית");
    }
  }

  return (
    <InternalLayout title="הפקת שוברי דלק">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding="lg">
          <CardHeader>
            <CardTitle>הפקת שוברי דלק</CardTitle>
            <Badge variant="info" size="md">
              <Link2 className="size-3.5" />
              לינק חד פעמי
            </Badge>
          </CardHeader>

          <form onSubmit={submit} className="mt-2 space-y-5">
            <FormField label="שם עובד" hint="השם יופיע מראש בלינק — העובד יאמת עם ת.ז וטלפון">
              <Input aria-label="שם עובד" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="שם מלא של העובד" required />
            </FormField>

            {blocks.map((b, i) => (
              <ClientBlock
                key={b.key}
                index={i}
                block={b}
                role={role}
                branch={me?.branch}
                onChange={(p) => patch(b.key, p)}
                onRemove={blocks.length > 1 ? () => setBlocks((bs) => bs.filter((x) => x.key !== b.key)) : undefined}
              />
            ))}

            <Button type="button" variant="outline" block onClick={() => setBlocks((bs) => [...bs, newBlock()])}>
              <Plus className="size-4" />
              הוספת לקוח
            </Button>

            {error || stockError ? <p className="text-sm font-semibold text-danger">{error ?? stockError}</p> : null}

            <Button type="submit" loading={loading} disabled={!stockReady || !!stockError} block>
              <Send className="size-4" />
              הפקת לינק לעובד
            </Button>
          </form>
        </Card>

        <Card padding="lg">
          <CardHeader>
            <CardTitle>הלינק לשליחה לעובד</CardTitle>
          </CardHeader>
          {link ? (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-dashed border-primary bg-blue-100/60 p-5 text-center">
                <p className="text-xs font-semibold text-muted-foreground">לינק אישי לעובד</p>
                <p dir="ltr" className="mt-2 break-all font-display text-lg font-extrabold text-secondary">{link}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="accent" block onClick={copyLink}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  העתק לינק
                </Button>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-surface px-4 text-sm font-bold text-primary transition-colors hover:bg-blue-100"
                >
                  <SquareArrowOutUpRight className="size-4" />
                  פתח בחלון חדש
                </a>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface-muted p-10 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-xl bg-blue-100 text-blue-700">
                <Link2 className="size-7" />
              </span>
              <p className="mt-3 font-display text-base font-extrabold text-secondary">עדיין לא הופק לינק</p>
              <p className="mt-1 text-sm text-muted-foreground">מלא שם עובד, לקוח, סכום וסיבה כדי לקבל לינק.</p>
            </div>
          )}
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-xl font-extrabold text-secondary">שוברים שהופקו</h2>
        <ProducedLinks limit={10} />
      </section>
    </InternalLayout>
  );
}

function ClientBlock({
  index, block, role, branch, onChange, onRemove,
}: {
  index: number;
  block: Block;
  role: string;
  branch?: string;
  onChange: (p: Partial<Block>) => void;
  onRemove?: () => void;
}) {
  const b2bClients = useAppStore((s) => s.b2bClients);
  const nonB2b = useAppStore((s) => s.nonB2bClients);
  const reasons = useAppStore((s) => s.reasons);
  const { mode, search, b2b, regular } = block;

  // Inactive clients (missing from the last import) are never offered.
  const allowedB2b = useMemo(
    () => b2bClients.filter((c) => c.isActive !== false && (role === "admin" || c.branch === branch)),
    [b2bClients, role, branch],
  );
  const modeReasons = reasons.filter((r) => r.category === (mode === "b2b" ? "B2B" : "Regular"));
  const selected = mode === "b2b" ? b2b : regular;
  const amountRules = issuanceAmountRules(block.fuelType);

  const matches = useMemo(() => {
    const q = search.trim();
    if (!q || selected) return [];
    if (mode === "b2b") return allowedB2b.filter((c) => c.clientName.includes(q) || c.accountName.includes(q)).slice(0, 8);
    return nonB2b.filter((c) => c.isActive !== false && (c.clientName.includes(q) || c.siteName.includes(q))).slice(0, 8);
  }, [search, selected, mode, allowedB2b, nonB2b]);

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-extrabold text-secondary">לקוח {index + 1}</p>
        {onRemove ? (
          <button type="button" aria-label="הסרת לקוח" onClick={onRemove} className="grid size-8 place-items-center rounded-md text-danger hover:bg-surface-muted">
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
      <div role="radiogroup" aria-label="סוג רכב" className="grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-1">
        {([["b2b", "רכב עבודה"], ["regular", "רכב פרטי"]] as const).map(([value, label]) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
              mode === value ? "bg-surface text-primary shadow-card" : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              name={`mode-${block.key}`}
              value={value}
              checked={mode === value}
              onChange={() => onChange({ mode: value, search: "", b2b: null, regular: null, reason: "" })}
              className="accent-primary"
            />
            {label}
          </label>
        ))}
      </div>

      <FormField label="בחירת לקוח">
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="חיפוש לקוח"
            value={search}
            onChange={(e) => onChange({ search: e.target.value, b2b: null, regular: null })}
            placeholder="הקלד שם לקוח…"
            className="pe-9"
          />
          {matches.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-raised">
              {matches.map((c) => {
                const isB2b = "accountName" in c;
                const sub = isB2b ? c.accountName : (c as ClientRecord).siteName;
                return (
                  <li key={isB2b ? `${c.clientCode}|${c.accountName}` : `${(c as ClientRecord).clientId}|${(c as ClientRecord).siteId}`}>
                    <button
                      type="button"
                      onClick={() =>
                        onChange(isB2b ? { b2b: c, search: `${c.clientName} · ${sub}` } : { regular: c as ClientRecord, search: `${c.clientName} · ${sub}` })
                      }
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-blue-100"
                    >
                      <span className="font-bold text-secondary">{c.clientName}</span>
                      <span className="truncate text-muted-foreground">{sub}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </FormField>

      {b2b && mode === "b2b" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard icon={Building2} label="שם לקוח" value={b2b.clientName} />
          <InfoCard icon={Hash} label="קוד לקוח" value={b2b.clientCode} />
          <InfoCard icon={MapPin} label="שם חשבון" value={b2b.accountName} />
          <InfoCard icon={BadgeCheck} label="תקן" value={b2b.standard} />
        </div>
      ) : null}
      {regular && mode === "regular" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard icon={Building2} label="לקוח" value={`${regular.clientName} (${regular.clientId})`} />
          <InfoCard icon={MapPin} label="אתר" value={`${regular.siteName} (${regular.siteId})`} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="סוג דלק">
          <Select aria-label="בחר סוג דלק" value={block.fuelType} onChange={(e) => onChange({ fuelType: e.target.value as FuelType })}>
            <option value="">בחר סוג דלק…</option>
            <option value="בנזין">בנזין 95</option>
            <option value="סולר">סולר</option>
          </Select>
        </FormField>
        <FormField label="סכום (₪)" hint={amountRules.hint}>
          <Input aria-label="סכום" type="number" min={amountRules.min} step={amountRules.step} inputMode="numeric" value={block.amount} onChange={(e) => onChange({ amount: e.target.value })} placeholder="300" className="tabular-nums" />
        </FormField>
        <FormField label="סיבת הנפקה">
          <Select aria-label="בחר סיבת הנפקה" value={block.reason} onChange={(e) => onChange({ reason: e.target.value })}>
            <option value="">בחר סיבה…</option>
            {modeReasons.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </Select>
        </FormField>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof Hash; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 font-display text-sm font-extrabold text-secondary">{value}</p>
    </div>
  );
}
