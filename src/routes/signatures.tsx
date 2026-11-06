import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";

import { Logo } from "@/design-system/delek-1ea111";
import { InternalLayout } from "@/components/layout/InternalLayout";
import { PageHero } from "@/components/ui/PageHero";
import { DataTable, EmptyRow, KV, MobileCardList } from "@/components/ui/DataTable";
import { Pager, usePaged } from "@/components/ui/Pager";
import { SearchField } from "@/components/settings/shared";
import { api } from "@/lib/apiClient";
import { useAppStore } from "@/store/appStore";
import { formatIsraelDate } from "@/lib/israelDate";

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

const fmt = (iso: string) => formatIsraelDate(iso, true);

function SerialList({ serials }: { serials: string[] }) {
  const shown = serials.slice(0, 2);
  const more = serials.length - shown.length;
  return (
    <span className="inline-flex items-center gap-1.5">
      {shown.map((s) => (
        <span key={s} className="ds-num rounded-md bg-table-head px-1.5 py-0.5 text-[12.5px] text-ink">{s}</span>
      ))}
      {more > 0 ? <span className="text-[12.5px] font-semibold text-slate-600">+{more}</span> : null}
      {serials.length === 0 ? "—" : null}
    </span>
  );
}

function SignaturesPage() {
  const role = useAppStore((s) => s.role);
  const [rows, setRows] = useState<SignatureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<SignatureRecord | null>(null);

  useEffect(() => {
    // The database only returns rows the viewer may see (own branch / own records).
    void api
      .from("signatures_archive")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }: { data: unknown[] | null; error: { message: string } | null }) => {
        if (error) setError(error.message);
        else
          setRows(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const paged = usePaged(filtered);
  const emptyText = loading
    ? "טוען…"
    : error
      ? `לא ניתן לטעון את הארכיון: ${error}`
      : rows.length === 0
        ? "אין חתימות בארכיון"
        : "אין חתימות בארכיון התואמות לחיפוש.";

  return (
    <InternalLayout title="ארכיון חתימות">
      <div className="contents print:hidden">
        <PageHero
          eyebrow="תיעוד ובקרה"
          title="ארכיון חתימות"
          subtitle="חתימות עובדים על קבלת שוברי דלק, עם טופס תיעוד להדפסה."
        />

        <section aria-label="טבלת חתימות" className="ds-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-table-line px-[18px] py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="m-0 text-lg font-extrabold text-navy-900">ארכיון חתימות עובדים</h2>
              <span className="text-[13px] text-slate-600">
                <span className="ds-num">{filtered.length.toLocaleString("he-IL")}</span> חתימות · מהחדש לישן
              </span>
            </div>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="חיפוש לפי שם, ת.ז, טלפון או מספר כרטיס"
              label="חיפוש בארכיון"
              className="min-[900px]:w-80"
            />
          </div>

          <DataTable minWidth={980} caption="ארכיון חתימות">
            <thead>
              <tr>
                <th scope="col">תאריך</th>
                <th scope="col">שם מלא</th>
                <th scope="col">ת.ז</th>
                <th scope="col">טלפון</th>
                <th scope="col">סכום השוברים</th>
                <th scope="col">מספרי כרטיסים</th>
                <th scope="col">טופס</th>
              </tr>
            </thead>
            <tbody>
              {paged.slice.length === 0 ? (
                <EmptyRow colSpan={7}>
                  {error ? <span className="font-semibold text-danger">{emptyText}</span> : emptyText}
                </EmptyRow>
              ) : (
                paged.slice.map((r) => (
                  <tr key={r.id}>
                    <td><span className="ds-num">{fmt(r.created_at)}</span></td>
                    <td className="font-semibold text-navy-900">{r.full_name}</td>
                    <td><span className="ds-num">{r.national_id}</span></td>
                    <td><span className="ds-num" dir="ltr">{r.phone}</span></td>
                    <td><span className="ds-num font-bold">{r.total_amount.toLocaleString("he-IL")} ₪</span></td>
                    <td><SerialList serials={r.serials} /></td>
                    <td>
                      <button type="button" className="ds-rowact" aria-label={`צפייה בטופס של ${r.full_name}`} onClick={() => setOpen(r)}>
                        צפייה
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
          <MobileCardList
            items={paged.slice}
            keyOf={(r) => r.id}
            empty={emptyText}
            render={(r) => (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-bold text-navy-900">{r.full_name}</span>
                    <span className="ds-num text-[12.5px] text-slate-600">{fmt(r.created_at)}</span>
                  </div>
                  <span className="ds-num font-bold text-navy-900">{r.total_amount.toLocaleString("he-IL")} ₪</span>
                </div>
                <KV label="ת.ז"><span className="ds-num">{r.national_id}</span></KV>
                <KV label="טלפון"><span className="ds-num" dir="ltr">{r.phone}</span></KV>
                <KV label="כרטיסים">{r.serials.length} כרטיסים</KV>
                <button type="button" className="ds-btn ds-btn-light" onClick={() => setOpen(r)}>
                  צפייה בטופס
                </button>
              </>
            )}
          />
          <div className="border-t border-table-line bg-[#fbfcfe] px-[18px] py-3.5">
            <Pager {...paged} always />
          </div>
        </section>
      </div>

      {open ? <RecordDialog record={open} onClose={() => setOpen(null)} /> : null}
    </InternalLayout>
  );
}

function RecordDialog({ record, onClose }: { record: SignatureRecord; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fields: [string, React.ReactNode][] = [
    ["תאריך ושעה", <span className="ds-num">{fmt(record.created_at)}</span>],
    ["שם מלא", record.full_name],
    ["ת.ז", <span className="ds-num">{record.national_id}</span>],
    ["טלפון", <span className="ds-num" dir="ltr">{record.phone}</span>],
    ["סכום השוברים", <span className="ds-num">{record.total_amount.toLocaleString("he-IL")} ₪</span>],
    ["מספר שוברים", <span className="ds-num">{record.serials.length}</span>],
  ];
  // On the page body, outside the app shell: printing shows this form alone (see styles.css).
  return createPortal(
    <div className="signature-print fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto print:static print:block min-[900px]:items-center min-[900px]:p-6">
      <button type="button" aria-label="סגירת הטופס" onClick={onClose} className="fixed inset-0 cursor-pointer bg-navy-900/55 print:hidden" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sigdlg-title"
        className="relative w-full max-w-2xl overflow-hidden rounded-t-dialog bg-surface shadow-dialog min-[900px]:rounded-dialog print:max-w-none print:rounded-none print:shadow-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-table-line px-5 py-3 print:hidden">
          <button type="button" className="ds-btn ds-btn-primary" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            הדפסה / PDF
          </button>
          <button type="button" className="ds-iconbtn" onClick={onClose} aria-label="סגירה">
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[78vh] space-y-6 overflow-y-auto p-6 min-[900px]:p-8 print:max-h-none print:overflow-visible">
          <div className="flex items-center justify-between gap-3 border-b-2 border-navy-900 pb-4">
            <h2 id="sigdlg-title" className="m-0 text-xl font-extrabold text-navy-900 min-[900px]:text-2xl">טופס תיעוד חתימת עובד</h2>
            <Logo className="h-16 min-[900px]:h-20 print:h-28" />
          </div>
          <dl className="m-0 grid grid-cols-1 overflow-hidden rounded-card border border-line sm:grid-cols-2">
            {fields.map(([k, v]) => (
              <div key={k} className="border-b border-s border-table-line px-4 py-3">
                <dt className="text-xs text-slate-600">{k}</dt>
                <dd className="m-0 font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="mb-2 text-sm font-bold text-navy-900">מספרי כרטיסים</p>
            <div className="flex flex-wrap gap-2">
              {record.serials.map((s) => (
                <span key={s} className="ds-num rounded-md border border-line bg-table-head px-2 py-1 text-sm">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-navy-900">חתימת העובד</p>
            <div className="rounded-card border border-line bg-surface p-3">
              <img src={record.signature} alt={`חתימת ${record.full_name}`} className="mx-auto max-h-40" />
              <p className="mt-3 border-t border-table-line pt-2 text-center text-sm font-semibold text-ink">
                נחתם בתאריך ובשעה: <span dir="ltr" className="ds-num">{fmt(record.created_at)}</span>
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            העובד/ת אישר/ה בחתימתו/ה את קבלת שוברי הדלק המפורטים לעיל.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
