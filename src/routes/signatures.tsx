import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, Printer, Search, X } from "lucide-react";

import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Logo,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { InternalLayout } from "@/components/layout/InternalLayout";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/store/appStore";

export const Route = createFileRoute("/signatures")({
  head: () => ({
    meta: [
      { title: "ארכיון חתימות | רשף ביטחון" },
      { name: "description", content: "ארכיון חתימות עובדים על קבלת שוברי דלק, כולל טופס תיעוד להדפסה." },
      { property: "og:title", content: "ארכיון חתימות | רשף ביטחון" },
      { property: "og:description", content: "תיעוד חתימות עובדים על קבלת שוברי דלק." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignaturesPage,
});

interface SignatureRecord {
  id: string;
  created_at: string;
  full_name: string;
  national_id: string;
  phone: string;
  total_amount: number;
  serials: string[];
  signature: string;
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
};

function SignaturesPage() {
  const role = useAppStore((s) => s.role);
  const [rows, setRows] = useState<SignatureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<SignatureRecord | null>(null);


  useEffect(() => {
    // The database only returns rows the viewer may see (own branch / own records).
    void (supabase as any)
      .from("signatures_archive")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }: { data: unknown[] | null; error: { message: string } | null }) => {
        if (error) setError(error.message);
        else
          setRows(
            ((data ?? []) as Record<string, any>[]).map((r) => ({
              id: r.id, created_at: r.created_at, full_name: r.employee_name, national_id: r.employee_id_number,
              phone: r.employee_phone, total_amount: Number(r.total_amount), serials: r.voucher_record_ids ?? [],
              signature: r.signature_image_url ?? "",
            })),
          );
        setLoading(false);
      });
  }, [role]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.full_name.includes(q) ||
        r.national_id.includes(q) ||
        r.phone.includes(q) ||
        r.serials.some((s) => s.includes(q)),
    );
  }, [rows, query]);


  return (
    <InternalLayout title="ארכיון חתימות">
      <Card padding="none" className="print:hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 p-5">
          <CardTitle>ארכיון חתימות עובדים</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי שם, ת.ז, טלפון או מספר כרטיס"
              className="ps-9"
            />
          </div>
        </CardHeader>
        <div className="px-5 pb-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">טוען…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm font-semibold text-danger">
              לא ניתן לטעון את הארכיון: {error}
            </p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>תאריך</TableHeaderCell>
                  <TableHeaderCell>שם מלא</TableHeaderCell>
                  <TableHeaderCell>ת.ז</TableHeaderCell>
                  <TableHeaderCell>טלפון</TableHeaderCell>
                  <TableHeaderCell>סכום השוברים</TableHeaderCell>
                  <TableHeaderCell>מספרי כרטיסים</TableHeaderCell>
                  <TableHeaderCell className="text-center">טופס</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      אין חתימות בארכיון
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                      <TableCell>{fmt(r.created_at)}</TableCell>
                      <TableCell className="font-semibold">{r.full_name}</TableCell>
                      <TableCell>{r.national_id}</TableCell>
                      <TableCell dir="ltr" className="text-end">{r.phone}</TableCell>
                      <TableCell>{r.total_amount.toLocaleString("he-IL")} ₪</TableCell>
                      <TableCell className="max-w-xs truncate">{r.serials.join(", ")}</TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" variant="ghost" aria-label="צפייה בטופס">
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {open ? <RecordDialog record={open} onClose={() => setOpen(null)} /> : null}
    </InternalLayout>
  );
}

function RecordDialog({ record, onClose }: { record: SignatureRecord; onClose: () => void }) {
  const fields: [string, React.ReactNode][] = [
    ["תאריך ושעה", fmt(record.created_at)],
    ["שם מלא", record.full_name],
    ["ת.ז", record.national_id],
    ["טלפון", <span dir="ltr">{record.phone}</span>],
    ["סכום השוברים", `${record.total_amount.toLocaleString("he-IL")} ₪`],
    ["מספר שוברים", record.serials.length],
  ];
  return (
    <div className="signature-print fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-secondary/50 p-4 print:static print:bg-transparent print:p-0">
      <div className="w-full max-w-2xl rounded-xl bg-surface shadow-card print:max-w-none print:shadow-none">
        <div className="flex items-center justify-between gap-2 border-b border-border px-6 py-3 print:hidden">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" />
            הדפסה / PDF
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="סגירה">
            <X className="size-5" />
          </Button>
        </div>
        <div className="space-y-6 p-8">
          <div className="flex items-center justify-between border-b-2 border-secondary pb-4">
            <h2 className="font-display text-2xl font-extrabold text-secondary">טופס תיעוד חתימת עובד</h2>
            <Logo className="h-24 print:h-28" />
          </div>
          <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-300">
            {fields.map(([k, v]) => (
              <div key={k} className="border-b border-s border-slate-200 px-4 py-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-semibold text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">מספרי כרטיסים</p>
            <div className="flex flex-wrap gap-2">
              {record.serials.map((s) => (
                <span key={s} className="rounded-sm border border-border bg-surface-muted px-2 py-1 text-sm">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">חתימת העובד</p>
            <div className="rounded-lg border border-slate-300 bg-surface p-3">
              <img src={record.signature} alt={`חתימת ${record.full_name}`} className="mx-auto max-h-40" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            העובד/ת אישר/ה בחתימתו/ה את קבלת שוברי הדלק המפורטים לעיל.
          </p>
        </div>
      </div>
    </div>
  );
}
