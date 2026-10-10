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

export function Pager({ page, pages, setPage, total }: { page: number; pages: number; setPage: (n: number) => void; total: number }) {
  if (pages <= 1) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, from + PAGE_SIZE - 1);
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">{from}–{to} מתוך {total.toLocaleString("he-IL")}</span>
      <div className="flex items-center gap-1">
        <button aria-label="הקודם" disabled={page === 0} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center rounded-md border border-border text-primary disabled:opacity-40">
          <ChevronRight className="size-4" />
        </button>
        <span className="px-2 tabular-nums">עמוד {page + 1} מתוך {pages}</span>
        <button aria-label="הבא" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center rounded-md border border-border text-primary disabled:opacity-40">
          <ChevronLeft className="size-4" />
        </button>
      </div>
    </div>
  );
}
