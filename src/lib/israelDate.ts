const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function formatIsraelDate(value: string | Date, withTime = false): string {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = Object.fromEntries(dateParts.formatToParts(date).map(p => [p.type, p.value]));
  const result = `${parts.day}/${parts.month}/${parts.year}`;
  return withTime ? `${result} ${parts.hour}:${parts.minute}:${parts.second}` : result;
}

export function parseIsraelDate(value: string): string | null {
  if (!value) return "";
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function inDateRange(value: string, from: string, to: string): boolean {
  const day = value.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}