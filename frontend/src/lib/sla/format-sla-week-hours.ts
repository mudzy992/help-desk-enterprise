import type { TFunction } from "i18next";
import { formatCivilDate } from "@/lib/format-civil-date";
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

/**
 * Datum praznika na jeziku interfejsa. Prije je koristio
 * `Intl.DateTimeFormat(locale, { dateStyle: "medium" })`, što u runtimeu bez
 * bosanskih CLDR podataka ispiše `2026 M10 4` (vidi `lib/format-civil-date.ts`).
 */
export function formatSlaHolidayDate(value: string, t: TFunction): string {
  return formatCivilDate(value, t) ?? value;
}
