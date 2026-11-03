import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 50;

/** Slices a list into pages of 50; resets to page 1 when the list changes size. */
export function usePaged<T>(items: T[], size = PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [pages, page]);
  const p = Math.min(page, pages - 1);
  return { page: p, pages, setPage, slice: items.slice(p * size, p * size + size), offset: p * size, total: items.length };
}

/** Page numbers to show: first, last, current ±1, with null for an ellipsis gap. */
function pageList(page: number, pages: number): (number | null)[] {
  const keep = new Set([0, pages - 1, page - 1, page, page + 1]);
  const out: (number | null)[] = [];
  for (let i = 0; i < pages; i++) {
    if (keep.has(i)) out.push(i);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

/**
 * Pager — table footer: "מציג 1–50 מתוך 312" + numbered page buttons (design: Main.dc.html pagination).
 * API unchanged for existing callers: spread `usePaged()` into it. Hidden when there is a single page,
 * unless `always` is set. Pass `size` when usePaged was given a custom page size.
 */
export function Pager({
  page,
  pages,
  setPage,
  total,
  size = PAGE_SIZE,
  always = false,
}: {
  page: number;
  pages: number;
  setPage: (n: number) => void;
  total: number;
  size?: number;
  always?: boolean;
}) {
  if (pages <= 1 && !always) return null;
  const from = total ? page * size + 1 : 0;
  const to = Math.min(total, page * size + size);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-slate-600">
      <span>
        מציג <span className="ds-num font-semibold text-navy-900">{from.toLocaleString("he-IL")}–{to.toLocaleString("he-IL")}</span> מתוך{" "}
        <span className="ds-num font-semibold text-navy-900">{total.toLocaleString("he-IL")}</span>
      </span>
      {pages > 1 ? (
        <nav aria-label="עימוד" className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="ds-pg" aria-label="הקודם" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronRight className="size-4" />
          </button>
          {pageList(page, pages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} aria-hidden className="px-1 text-slate-400">…</span>
            ) : (
              <button
                key={n}
                type="button"
                className="ds-pg ds-num"
                aria-current={n === page ? "page" : undefined}
                aria-label={`עמוד ${n + 1}`}
                onClick={() => setPage(n)}
              >
                {n + 1}
              </button>
            ),
          )}
          <button type="button" className="ds-pg" aria-label="הבא" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            <ChevronLeft className="size-4" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
