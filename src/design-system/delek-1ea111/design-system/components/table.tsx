import { forwardRef, useCallback, useEffect, useRef } from "react";
import { cn } from "../lib/utils";

const PRIORITY = /סכום|סטטוס|מצב|ערך|יתרה|₪/;

/** Copies header labels onto each cell so rows can render as cards on mobile. */
function labelCells(table: HTMLTableElement) {
  const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
  table.querySelectorAll("tbody tr").forEach((tr) => {
    Array.from(tr.children).forEach((cell, i) => {
      const td = cell as HTMLElement;
      const label = td.hasAttribute("colspan") && Number(td.getAttribute("colspan")) > 1 ? "" : headers[i] ?? "";
      if (td.dataset.label !== label) td.dataset.label = label;
      const pri = label && PRIORITY.test(label) ? "1" : "";
      if ((td.dataset.priority ?? "") !== pri) {
        if (pri) td.dataset.priority = pri;
        else delete td.dataset.priority;
      }
    });
  });
}

/** Scrollable wrapper + table surface; rows become stacked cards below md. */
export const Table = forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => {
    const inner = useRef<HTMLTableElement | null>(null);
    const setRef = useCallback(
      (el: HTMLTableElement | null) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      },
      [ref],
    );
    useEffect(() => {
      const el = inner.current;
      if (!el) return;
      labelCells(el);
      const obs = new MutationObserver(() => labelCells(el));
      obs.observe(el, { childList: true, subtree: true, characterData: true });
      return () => obs.disconnect();
    }, []);
    return (
      <div className="responsive-table w-full rounded-lg md:overflow-x-auto md:border md:border-slate-300 md:bg-surface">
        <table ref={setRef} className={cn("w-full border-collapse text-sm", className)} {...props} />
      </div>
    );
  },
);
Table.displayName = "Table";

export const TableHead = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("bg-slate-50", className)} {...props} />
));
TableHead.displayName = "TableHead";

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <tbody ref={ref} className={className} {...props} />);
TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b border-border/60 last:border-0 hover:bg-slate-50/70", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

export const TableHeaderCell = forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    scope="col"
    className={cn(
      "border-s border-slate-200 px-4 py-3 text-start font-semibold text-muted-foreground first:border-s-0",
      className,
    )}
    {...props}
  />
));
TableHeaderCell.displayName = "TableHeaderCell";

export const TableCell = forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "border-s border-slate-200 px-4 py-3 text-start text-foreground first:border-s-0",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";
