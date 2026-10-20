/**
 * Civil-time contract for incident and downtime authoring.
 *
 * `datetime-local` values are interpreted in the browser's current IANA zone.
 * API boundaries always receive ISO-8601 instants. Formatting an instant back to
 * a control value uses that same browser zone. A round-trip check rejects
 * malformed calendar values and civil times skipped by a DST transition.
 */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function toDatetimeLocalValue(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || toDatetimeLocalValue(date) !== value) return null;
  return date.toISOString();
}

export function formatInstantInZone(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

export function isValidCivilRange(startsAt: string, endsAt: string): boolean {
  const start = fromDatetimeLocalValue(startsAt);
  const end = fromDatetimeLocalValue(endsAt);
  return start !== null && end !== null && Date.parse(end) > Date.parse(start);
}
