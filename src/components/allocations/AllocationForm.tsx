import type { ReactNode } from "react";
import { Send } from "lucide-react";

import { FUEL_TYPES, fuelLabel, type FuelType } from "@/components/fuel/fuel";
import { issuanceAmountError, issuanceAmountRules, STOCK_SHORTAGE } from "@/lib/issuanceInventory";
import { pickExact } from "@/lib/inventorySelection";
import { groupStock } from "@/store/appStore";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

/** Shared input look of the redesign (44px, 11px radius, mint focus ring). */
export const fieldClass =
  "h-11 w-full rounded-control border border-line-strong bg-white px-3 text-[15px] text-navy-900 outline-none transition-shadow focus:shadow-focus-mint disabled:cursor-not-allowed disabled:bg-table-head";
export const fieldBadClass = "border-red-500 bg-[#fffafa]";
export const labelClass = "flex min-w-0 flex-col gap-1.5 text-[13.5px] font-bold text-navy-900";

const fmt = (n: number) => n.toLocaleString("he-IL");

/** "2×500 + 1×100" — the physical cards a pick consists of. */
export function cardsText(cards: { amount: number }[]): string {
  const m = new Map<number, number>();
  for (const c of cards) m.set(c.amount, (m.get(c.amount) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([amt, n]) => `${n}×${amt}`).join(" + ");
}

export interface FuelAmountCheck {
  amount: number;
  error: string | null;
  /** Cards that would be selected (preview only — the store/DB re-pick on submit). */
  pick: { amount: number }[] | null;
}

/**
 * Live per-field check using the existing rules: issuanceAmountError (petrol ×100 / diesel ×50),
 * ≤ available, and pickExact composability from the given pool.
 */
export function checkFuelAmount(fuel: FuelType, raw: string, available: number, pool: { amount: number }[], overLabel: string): FuelAmountCheck {
  const text = raw.trim();
  if (!text) return { amount: 0, error: null, pick: null };
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 0) return { amount: 0, error: "סכום לא תקין", pick: null };
  if (n === 0) return { amount: 0, error: null, pick: null };
  const amountError = issuanceAmountError(fuel, n);
  if (amountError) return { amount: n, error: amountError, pick: null };
  if (n > available) return { amount: n, error: `${overLabel} (${fmt(available)} ₪)`, pick: null };
  const pick = pickExact(pool, n);
  if (!pick) return { amount: n, error: pool.length ? `${STOCK_SHORTAGE}. המלאי הזמין: ${groupStock(pool)}.` : STOCK_SHORTAGE, pick: null };
  return { amount: n, error: null, pick };
}

export interface RecipientOption {
  value: string;
  label: string;
  /** Optgroup (branch) label. */
  group?: string;
}

/**
 * The simple allocation form (Allocations.dc.html): recipient select, one open amount field per fuel
 * (either or both), availability + "ייבחרו" preview, total and submit. Purely presentational — callers
 * own validation-on-submit and the store calls.
 */
export function AllocationFormFields({
  recipientLabel,
  recipientPlaceholder,
  recipients,
  recipient,
  onRecipient,
  recipientHint,
  emptyRecipientsNote,
  values,
  onValues,
  available,
  pools,
  availPrefix,
  overLabel,
  error,
  fallbackError,
  loading,
  submitDisabled,
  onCancel,
  idPrefix,
}: {
  recipientLabel: string;
  recipientPlaceholder: string;
  recipients: RecipientOption[];
  recipient: string;
  onRecipient: (value: string) => void;
  recipientHint?: ReactNode;
  emptyRecipientsNote?: ReactNode;
  values: Record<FuelType, string>;
  onValues: (v: Record<FuelType, string>) => void;
  available: Record<FuelType, number> | null;
  pools: Record<FuelType, { amount: number }[]>;
  availPrefix: string;
  overLabel: string;
  error: string | null;
  /** Shown only when no field already shows its own error (avoids duplicate messages). */
  fallbackError?: string | null;
  loading: boolean;
  submitDisabled: boolean;
  onCancel?: () => void;
  idPrefix: string;
}) {
  const groups: { group: string; items: RecipientOption[] }[] = [];
  for (const r of recipients) {
    const g = r.group ?? "";
    const found = groups.find((x) => x.group === g);
    if (found) found.items.push(r);
    else groups.push({ group: g, items: [r] });
  }
  const checks = Object.fromEntries(
    FUEL_TYPES.map((f) => [f, checkFuelAmount(f, values[f], available?.[f] ?? 0, pools[f], overLabel)]),
  ) as Record<FuelType, FuelAmountCheck>;
  const total = FUEL_TYPES.reduce((t, f) => t + (checks[f].pick ? checks[f].amount : 0), 0);

  return (
    <div className="flex flex-col gap-[18px]">
      <label className={labelClass} htmlFor={`${idPrefix}-recipient`}>
        {recipientLabel}
        <select
          id={`${idPrefix}-recipient`}
          className={fieldClass}
          value={recipient}
          onChange={(e) => onRecipient(e.target.value)}
        >
          <option value="">{recipientPlaceholder}</option>
          {groups.map(({ group, items }) =>
            group ? (
              <optgroup key={group} label={group}>
                {items.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </optgroup>
            ) : (
              items.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)
            ),
          )}
        </select>
        {recipients.length === 0 && emptyRecipientsNote ? (
          <span className="text-[12.5px] font-medium text-slate-600">{emptyRecipientsNote}</span>
        ) : null}
        {recipientHint ? <span className="text-[12.5px] font-medium text-slate-600">{recipientHint}</span> : null}
      </label>

      <div className="grid gap-4 min-[600px]:grid-cols-2">
        {FUEL_TYPES.map((f) => {
          const c = checks[f];
          const rules = issuanceAmountRules(f);
          const id = `${idPrefix}-${f === "בנזין" ? "petrol" : "diesel"}`;
          return (
            <div key={f} className={labelClass}>
              <label htmlFor={id}>{fuelLabel(f)} (₪)</label>
              <input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                step={rules.step}
                placeholder="0"
                value={values[f]}
                onChange={(e) => onValues({ ...values, [f]: e.target.value })}
                aria-invalid={c.error ? true : undefined}
                aria-describedby={`${id}-hint`}
                className={cn(fieldClass, "ds-num", c.error && fieldBadClass)}
              />
              <span id={`${id}-hint`} className="text-[12.5px] font-medium text-slate-600">
                {availPrefix}: {available ? `${fmt(available[f])} ₪` : "—"} · {rules.hint}
              </span>
              {c.error ? <span role="alert" className="text-[12.5px] font-bold text-red-700">{c.error}</span> : null}
              {c.pick ? <span className="ds-num text-[12.5px] font-semibold text-available-fg">ייבחרו: {cardsText(c.pick)}</span> : null}
            </div>
          );
        })}
      </div>

      {error || (fallbackError && !FUEL_TYPES.some((f) => checks[f].error)) ? (
        <p role="alert" className="m-0 text-sm font-semibold text-red-700">{error ?? fallbackError}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-table-line pt-4">
        <span className="text-sm text-slate-600">
          סה״כ להקצאה: <span className="ds-num font-bold text-navy-900">{fmt(total)} ₪</span>
        </span>
        <div className="flex flex-wrap gap-2 max-[599.98px]:w-full max-[599.98px]:[&>*]:flex-1">
          {onCancel ? (
            <button type="button" className="ds-btn ds-btn-light" onClick={onCancel} disabled={loading}>ביטול</button>
          ) : null}
          <button type="submit" className="ds-btn ds-btn-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={submitDisabled || loading} aria-busy={loading}>
            <Send className="size-4" aria-hidden />
            {loading ? "מבצע הקצאה…" : "בצע הקצאה"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pool card ("מאגר מרכזי" / "היתרה שלי"): per-fuel total + card breakdown. */
export function PoolSummary({ title, totals, pools }: { title: string; totals: Record<FuelType, number> | null; pools: Record<FuelType, { amount: number }[]> }) {
  return (
    <section aria-label={title} className="ds-card flex flex-col gap-3.5 p-[22px]">
      <h2 className="m-0 text-base font-extrabold text-navy-900">{title}</h2>
      {FUEL_TYPES.map((f) => (
        <div key={f} className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-[#fbfcfe] px-4 py-3.5">
          <span
            className={cn(
              "self-start rounded-lg border px-2.5 py-[3px] text-[12.5px] font-bold",
              f === "סולר" ? "border-[#c9d6ee] bg-[#f2f5fb] text-shell-2" : "border-[#bfe9e0] bg-[#effaf7] text-available-fg",
            )}
          >
            {fuelLabel(f)}
          </span>
          <span className="ds-num text-[26px] font-semibold text-navy-900">{totals ? `${fmt(totals[f])} ₪` : "—"}</span>
          <span className="ds-num text-xs text-slate-600">{pools[f].length ? cardsText(pools[f]) : "אין כרטיסים"}</span>
        </div>
      ))}
    </section>
  );
}
