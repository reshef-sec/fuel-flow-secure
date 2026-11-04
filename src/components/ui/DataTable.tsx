import type { CSSProperties, Key, ReactNode } from "react";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

/**
 * TableCard — the white card that holds a table: optional toolbar row (chips / search / filters),
 * the body, and an optional footer (pager). Design: Main.dc.html `section[aria-label=טבלת שוברים]`.
 *
 *   <TableCard label="טבלת שוברים" toolbar={<FilterChips … />} footer={<Pager … />}>
 *     <DataTable maxHeight={470} minWidth={1180}>…</DataTable>
 *     <MobileCardList items={rows} … />
 *   </TableCard>
 */
export function TableCard({
  label,
  toolbar,
  footer,
  children,
  className,
}: {
  /** aria-label for the section. */
  label?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={label} className={cn("ds-card overflow-hidden", className)}>
      {toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-table-line px-[18px] py-4">{toolbar}</div>
      ) : null}
      {children}
      {footer ? <div className="border-t border-table-line bg-[#fbfcfe] px-[18px] py-3.5">{footer}</div> : null}
    </section>
  );
}

/**
 * DataTable — scroll wrapper (slim scrollbar) + `.ds-grid` table: sticky header, zebra rows,
 * hover highlight, optional sticky first column. Pass ordinary <thead>/<tbody>/<tfoot> children.
 * Hidden under 900px when `desktopOnly` (default) — pair it with <MobileCardList>.
 * Mark an inactive row with <tr className="is-inactive"> (light red background).
 */
export function DataTable({
  children,
  maxHeight = 520,
  minWidth,
  stickyFirst = true,
  fit = true,
  desktopOnly = true,
  caption,
  className,
}: {
  children: ReactNode;
  /** Max height of the scroll area (px or CSS length); header stays sticky inside it. */
  maxHeight?: number | string;
  /** Minimum table width (px) before horizontal scrolling kicks in. */
  minWidth?: number;
  stickyFirst?: boolean;
  /** Fit all columns in the card: compact cells, wrapping text, no horizontal scroll (default; ignores minWidth). */
  fit?: boolean;
  /** Hide under 900px (render a MobileCardList instead). Set false to keep the table on phones. */
  desktopOnly?: boolean;
  /** Visually hidden caption for screen readers. */
  caption?: string;
  className?: string;
}) {
  const style: CSSProperties = { maxHeight };
  return (
    <div className={cn("ds-scroll", desktopOnly && "ds-desk", className)} style={style} tabIndex={0} role="region" aria-label={caption}>
      <table className={cn("ds-grid", stickyFirst && !fit && "ds-grid-sticky-first", fit && "ds-grid-fit")} style={minWidth && !fit ? { minWidth } : undefined}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

/**
 * MobileCardList — the phone replacement for a table (<900px only): a column of `.ds-vcard`
 * cards on a light background. Use <KV> rows inside for label/value pairs.
 *
 *   <MobileCardList items={rows} keyOf={(r) => r.serial} render={(r) => (<>
 *     <div className="flex items-center justify-between"><b className="ds-num">{r.serial}</b><StatusBadge status={r.status} /></div>
 *     <KV label="סניף">{r.branch}</KV>
 *   </>)} />
 */
export function MobileCardList<T>({
  items,
  render,
  keyOf,
  empty,
  className,
}: {
  items: readonly T[];
  render: (item: T, index: number) => ReactNode;
  keyOf: (item: T, index: number) => Key;
  /** Shown when the list is empty. */
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ds-mob flex-col gap-2.5 bg-table-head p-3", className)}>
      {items.length === 0 && empty ? <div className="px-2 py-8 text-center text-sm text-slate-600">{empty}</div> : null}
      {items.map((item, i) => (
        <article key={keyOf(item, i)} className="ds-vcard">
          {render(item, i)}
        </article>
      ))}
    </div>
  );
}

/** KV — one "label … value" line inside a mobile card. */
export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="ds-kv">
      <span>{label}</span>
      <span className="min-w-0 text-end">{children}</span>
    </div>
  );
}

/** EmptyRow — a full-width "no results" row inside a DataTable tbody. */
export function EmptyRow({ colSpan, children = "לא נמצאו רשומות התואמות לסינון." }: { colSpan: number; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="!h-auto !py-12 text-center !whitespace-normal text-slate-600">
        {children}
      </td>
    </tr>
  );
}
