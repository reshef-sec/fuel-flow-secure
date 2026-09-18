import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Link2, Send, SquareArrowOutUpRight } from "lucide-react";
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
import { NoAccess } from "@/components/layout/NoAccess";
import { useAppStore } from "@/store/appStore";

export const Route = createFileRoute("/supervisor")({
  head: () => ({
    meta: [
      { title: "הפקת שובר לעובד | רשף ביטחון" },
      {
        name: "description",
        content: "הפקת לינק שובר דלק אישי לעובד: סכום, לקוח, אתר וסיבת הנפקה.",
      },
      { property: "og:title", content: "הפקת שובר לעובד | רשף ביטחון" },
      { property: "og:description", content: "הפקת שובר לעובד ושליחת לינק בוואטסאפ." },
    ],
  }),
  component: SupervisorPage,
});

function SupervisorPage() {
  const clients = useAppStore((s) => s.clients);
  const reasons = useAppStore((s) => s.reasons);
  const role = useAppStore((s) => s.role);

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.clientId, c.clientName));
    return [...map].map(([clientId, clientName]) => ({ clientId, clientName }));
  }, [clients]);

  const [amount, setAmount] = useState("");
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sites = clients.filter((c) => c.clientId === clientId);

  useEffect(() => {
    setSiteId("");
  }, [clientId]);

  const numeric = Number(amount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!numeric || !clientId || !siteId || !reason) {
      setError("יש למלא סכום, לקוח, אתר וסיבת הנפקה");
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
      const token = Math.floor(10000 + Math.random() * 89999);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setLink(`${origin}/worker/${token}`);
      setCopied(false);
      toast.success("הלינק לעובד הופק בהצלחה");
    }, 1000);
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
    <InternalLayout title="הפקת שובר לעובד">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding="lg">
          <CardHeader>
            <CardTitle>הפקת שובר לעובד</CardTitle>
            <Badge variant="info" size="md">
              <Link2 className="size-3.5" />
              לינק חד פעמי
            </Badge>
          </CardHeader>
          <p className="text-sm text-muted-foreground">
            השובר אינו מוקצה מיד. נוצר לינק אישי לעובד, והשובר מונפק רק לאחר מילוי הפרטים והחתימה.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-5">
            <FormField label="סכום השובר (₪)" hint="בכפולות של 100 ₪ בלבד">
              <Input
                aria-label="סכום השובר"
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

            <FormField label="לקוח">
              <Select
                aria-label="בחר לקוח"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">בחר לקוח…</option>
                {clientOptions.map((c) => (
                  <option key={c.clientId} value={c.clientId}>
                    {c.clientName} ({c.clientId})
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="אתר">
              <Select
                aria-label="בחר אתר"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                disabled={!clientId}
              >
                <option value="">{clientId ? "בחר אתר…" : "יש לבחור לקוח קודם"}</option>
                {sites.map((s) => (
                  <option key={s.siteId} value={s.siteId}>
                    {s.siteName} ({s.siteId})
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="סיבת הנפקה">
              <Select
                aria-label="בחר סיבת הנפקה"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">בחר סיבה…</option>
                {reasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </FormField>

            {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

            <Button type="submit" loading={loading} block>
              <Send className="size-4" />
              הפקת שובר לעובד
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
                <p
                  dir="ltr"
                  className="mt-2 break-all font-display text-lg font-extrabold text-secondary"
                >
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
              <p className="text-center text-xs text-muted-foreground">
                הלינק תקף לשימוש חד פעמי בלבד ומתעד את הלקוח, האתר וסיבת ההנפקה שנבחרו.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface-muted p-10 text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-xl bg-blue-100 text-blue-700">
                <Link2 className="size-7" />
              </span>
              <p className="mt-3 font-display text-base font-extrabold text-secondary">
                עדיין לא הופק לינק
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                מלא את הטופס ולחץ על "הפקת שובר לעובד" כדי לקבל לינק לשליחה.
              </p>
            </div>
          )}
        </Card>
      </div>
    </InternalLayout>
  );
}
