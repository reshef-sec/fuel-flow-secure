import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeCheck,
  Building2,
  Car,
  Check,
  Copy,
  Link2,
  MapPin,
  Search,
  Send,
  SquareArrowOutUpRight,
  User,
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
  type VehicleRecord,
} from "@/store/appStore";

export const Route = createFileRoute("/supervisor")({
  head: () => ({
    meta: [
      { title: "הפקת שובר לעובד | רשף ביטחון" },
      {
        name: "description",
        content: "הפקת לינק שובר דלק אישי לעובד לפי רישוי רכב או שם נהג, סכום וסיבת הנפקה.",
      },
      { property: "og:title", content: "הפקת שובר לעובד | רשף ביטחון" },
      { property: "og:description", content: "חיפוש רכב חכם והפקת לינק שובר לעובד בוואטסאפ." },
    ],
  }),
  component: SupervisorPage,
});

function SupervisorPage() {
  const clients = useAppStore((s) => s.clients);
  const vehicles = useAppStore((s) => s.vehicles);
  const reasons = useAppStore((s) => s.reasons);
  const role = useAppStore((s) => s.role);
  const issueWorkerVoucher = useAppStore((s) => s.issueWorkerVoucher);
  const me = useCurrentUser();

  const [search, setSearch] = useState("");
  const [vehicle, setVehicle] = useState<VehicleRecord | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const matches = useMemo(() => {
    const q = search.trim();
    if (!q || vehicle) return [];
    return vehicles
      .filter((v) => v.licensePlate.includes(q) || v.driverName.includes(q))
      .slice(0, 6);
  }, [search, vehicle, vehicles]);

  /** Joined client + site for the selected vehicle. */
  const site = vehicle
    ? clients.find(
        (c) => c.clientId === vehicle.linkedClientCode && c.siteId === vehicle.linkedSiteCode,
      )
    : undefined;

  const numeric = Number(amount);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle || !numeric || !reason) {
      setError("יש לבחור רכב, למלא סכום ולבחור סיבת הנפקה");
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
      issueWorkerVoucher({
        amount: numeric,
        reason,
        branch: me?.branch ?? "הנהלה",
        ...(me ? { supervisor: fullName(me) } : {}),
        vehicle,
        clientName: site?.clientName ?? "",
        siteName: site?.siteName ?? "",
        ...(me ? { requester: fullName(me) } : {}),
      });
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

  if (role === "supervisor") return <NoAccess title="הפקת שובר לעובד" />;

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
            מחפשים רכב לפי רישוי או שם נהג — הלקוח, האתר והתקן נשלפים אוטומטית מהמאגר.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-5">
            <FormField label="חיפוש רכב" hint="רישוי רכב או שם נהג">
              <div className="relative">
                <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="חיפוש רכב לפי רישוי או שם נהג"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setVehicle(null);
                  }}
                  placeholder="12-345-67 או שם הנהג"
                  className="pe-9"
                />
                {matches.length > 0 ? (
                  <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-raised">
                    {matches.map((v) => (
                      <li key={v.licensePlate}>
                        <button
                          type="button"
                          onClick={() => {
                            setVehicle(v);
                            setSearch(`${v.licensePlate} · ${v.driverName}`);
                          }}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm transition-colors hover:bg-blue-100"
                        >
                          <span className="font-bold text-secondary">{v.driverName}</span>
                          <span dir="ltr" className="tabular-nums text-muted-foreground">
                            {v.licensePlate}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </FormField>

            {vehicle ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoCard icon={Car} label="רישוי רכב" value={vehicle.licensePlate} ltr />
                <InfoCard icon={User} label="שם נהג" value={vehicle.driverName} />
                <InfoCard icon={BadgeCheck} label="שם תקן" value={vehicle.standardName} />
                <InfoCard
                  icon={Building2}
                  label="לקוח"
                  value={`${site?.clientName ?? "—"} (${vehicle.linkedClientCode})`}
                />
                <InfoCard
                  icon={MapPin}
                  label="אתר / פרויקט"
                  value={`${site?.siteName ?? "—"} (${vehicle.linkedSiteCode})`}
                  wide
                />
              </div>
            ) : null}

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
                הלינק תקף לשימוש חד פעמי בלבד ומתעד את הרכב, הנהג, התקן, הלקוח והאתר שנבחרו.
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
                בחר רכב, מלא סכום וסיבה ולחץ על "הפקת שובר לעובד" כדי לקבל לינק לשליחה.
              </p>
            </div>
          )}
        </Card>
      </div>
    </InternalLayout>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  ltr,
  wide,
}: {
  icon: typeof Car;
  label: string;
  value: string;
  ltr?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface-muted p-3",
        wide && "sm:col-span-2",
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p
        {...(ltr ? { dir: "ltr" as const } : {})}
        className="mt-1 font-display text-sm font-extrabold text-secondary"
      >
        {value}
      </p>
    </div>
  );
}
