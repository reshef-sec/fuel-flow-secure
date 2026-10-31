import { useEffect, useState } from "react";
import { Input } from "@/design-system/delek-1ea111";
import { formatIsraelDate, parseIsraelDate } from "@/lib/israelDate";

/** Localized presentation; callers continue to store ISO date bounds. */
export function IsraelDateInput({ value, onChange, label }: { value: string; onChange: (iso: string) => void; label: string }) {
  const [text, setText] = useState(value ? formatIsraelDate(value) : "");
  useEffect(() => { setText(value ? formatIsraelDate(value) : ""); }, [value]);
  const invalid = parseIsraelDate(text) === null;
  return <div>
    <Input aria-label={label} dir="ltr" placeholder="DD/MM/YYYY" inputMode="numeric" maxLength={10}
      value={text} aria-invalid={invalid} onChange={event => {
        setText(event.target.value);
        const iso = parseIsraelDate(event.target.value);
        if (iso !== null) onChange(iso);
      }} />
    {invalid ? <p className="mt-1 text-xs text-danger">יש להזין תאריך תקין בפורמט DD/MM/YYYY</p> : null}
  </div>;
}