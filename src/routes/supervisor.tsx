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
import { NoAccess } from "@/components/layout/NoAccess";
import {
  fullName,
  useAppStore,
  useCurrentUser,
  type B2BClientRecord,
  type ClientRecord,
} from "@/store/appStore";

export const Route = createFileRoute("/supervisor")({
  head: () => ({
    meta: [
      { title: "הפקת שוברי דלק | רשף ביטחון" },
      {
        name: "description",
        content: "הפקת לינק שוברי דלק לעובד — בחיוב לקוח (B2B) או ללא חיוב לקוח.",
      },
      { property: "og:title", content: "הפקת שוברי דלק | רשף ביטחון" },
      { property: "og:description", content: "הפקת לינק שוברי דלק לעובד בחיוב או ללא חיוב לקוח." },
    ],
  }),
  component: SupervisorPage,
});

type Mode = "b2b" | "regular";

function SupervisorPage() {
  const b2bClients = useAppStore((s) => s.b2bClients);
  const nonB2b = useAppStore((s) => s.nonB2bClients);
  const reasons = useAppStore((s) => s.reasons);
  const role = useAppStore((s) => s.role);
  const issueWorkerVoucher = useAppStore((s) => s.issueWorkerVoucher);
  const me = useCurrentUser();

  const [mode, setMode] = useState<Mode>("b2b");
  const [search, setSearch] = useState("");
  const [b2b, setB2b] = useState<B2BClientRecord | null>(null);
  const [regular, setRegular] = useState<ClientRecord | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Security filter: non-admins only see B2B clients of their own branch.
  const allowedB2b = useMemo(
    () => (role === "admin" ? b2bClients : b2bClients.filter((c) => c.branch === me?.branch)),
    [b2bClients, role, me?.branch],
  );
  const modeReasons = reasons.filter((r) => r.category === (mode === "b2b" ? "B2B" : "Regular"));
  const selected = mode === "b2b" ? b2b : regular;

  const matches = useMemo(() => {
    const q = search.trim();
    if (!q || selected) return [];
    if (mode === "b2b") return allowedB2b.filter((c) => c.clientName.includes(q) || c.accountName.includes(q)).slice(0, 8);
    return nonB2b.filter((c) => c.clientName.includes(q) || c.siteName.includes(q)).slice(0, 8);
  }, [search, selected, mode, allowedB2b, nonB2b]);

  function switchMode(next: Mode) {
    setMode(next);
    setSearch("");
    setB2b(null);
    setRegular(null);
    setReason("");
    setError(null);
  }

  const numeric = Number(amount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !numeric || !reason) {
      setError("יש לבחור לקוח, למלא סכום ולבחור סיבת הנפקה");
      return;
    }
    if (numeric % 100 !== 0) {
      setError("הסכום חייב להיות בכפולות של 100 ₪");
      return;
    }
    setError(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const base = {
        amount: numeric,
        reason,
        branch: me?.branch ?? "הנהלה",
        ...(me ? { supervisor: fullName(me), requester: fullName(me) } : {}),
      };
      const created =
        mode === "b2b" && b2b
          ? issueWorkerVoucher({
              ...base,
              route: "b2b",
              clientName: b2b.clientName,
              clientCode: b2b.clientCode,
              accountName: b2b.accountName,
              standard: b2b.standard,
            })
          : issueWorkerVoucher({
              ...base,
              route: "regular",
              clientName: regular!.clientName,
              clientCode: regular!.clientId,
              siteId: regular!.siteId,
              siteName: regular!.siteName,
            });
      setLink(`${window.location.origin}/voucher/${created.id}`);
      setCopied(false);
      toast.success(`הופקו ${created.serials.length} קודים והלינק מוכן`);
    }, 800);
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

  if (role === "supervisor") return <NoAccess title="הפקת שוברי דלק" />;

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
            <div role="radiogroup" aria-label="סוג הנפקה" className="grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-1">
              {(
                [
                  ["b2b", "רכב עבודה"],
                  ["regular", "רכב פרטי"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
                    mode === value ? "bg-surface text-primary shadow-card" : "text-muted-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => switchMode(value)}
                    className="accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>

            <FormField
              label="בחירת לקוח"
              hint={mode === "b2b" ? "מוצגים רק לקוחות הסניף שלך" : "חיפוש לפי שם לקוח או אתר"}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="חיפוש לקוח"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setB2b(null);
                    setRegular(null);
                  }}
                  placeholder="הקלד שם לקוח…"
                  className="pe-9"
                />
                {matches.length > 0 ? (
                  <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-raised">
                    {matches.map((c) => {
                      const isB2b = "accountName" in c;
                      const title = c.clientName;
                      const sub = isB2b ? c.accountName : (c as ClientRecord).siteName;
                      return (
                        <li key={isB2b ? `${c.clientCode}|${c.accountName}` : `${(c as ClientRecord).clientId}|${(c as ClientRecord).siteId}`}>
                          <button
                            type="button"
                            onClick={() => {
                              if (isB2b) setB2b(c);
                              else setRegular(c as ClientRecord);
                              setSearch(`${title} · ${sub}`);
                            }}
                            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-blue-100"
                          >
                            <span className="font-bold text-secondary">{title}</span>
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

            <FormField label="סכום (₪)" hint="בכפולות של 100 ₪ — כל 100 ₪ הם קוד נפרד">
              <Input
                aria-label="סכום"
                type="number"
                min={100}
                step={100}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="300"
                className="tabular-nums"
              />
            </FormField>

            <FormField label="סיבת הנפקה">
              <Select aria-label="בחר סיבת הנפקה" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">בחר סיבה…</option>
                {modeReasons.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </FormField>

            {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

            <Button type="submit" loading={loading} block>
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
                <p dir="ltr" className="mt-2 break-all font-display text-lg font-extrabold text-secondary">
                  {link}
                </p>
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
              <p className="mt-1 text-sm text-muted-foreground">בחר סוג הנפקה, לקוח, סכום וסיבה כדי לקבל לינק.</p>
            </div>
          )}
        </Card>
      </div>
    </InternalLayout>
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
