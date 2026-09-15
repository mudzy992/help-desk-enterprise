import type { WeeklyHours } from "@/services/sla-types";

export function formatSlaHourLabel(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (match === null) {
    return value;
  }
  const hours = match[1].padStart(2, "0");
  return match[2] === "00" ? hours : `${hours}:${match[2]}`;
}

export function formatSlaDayHours(
  weeklyHours: WeeklyHours,
  weekday: string,
): string | null {
  const intervals = weeklyHours[weekday];
  if (intervals === undefined || intervals.length === 0) {
    return null;
  }
  return intervals
    .map((interval) => `${formatSlaHourLabel(interval.start)}–${formatSlaHourLabel(interval.end)}`)
    .join(", ");
}

export function formatSlaHolidayDate(value: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date =
    match === null
      ? new Date(value)
      : new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
