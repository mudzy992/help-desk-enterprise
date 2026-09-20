import type { TFunction } from "i18next";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { ticketText } from "@/lib/tickets/ticket-text";

const minute = 60_000;
const hour = 3_600_000;
const day = 86_400_000;
const relativeDaysLimit = 30;

/**
 * Relative time built only from translation keys (`relativeTime.*`, with
 * plural forms per language), so it never falls back to the browser's
 * English wording ("yesterday") when the browser lacks locale data.
 * Beyond a month it shows the absolute date.
 */
export function formatRelativeTime(
  value: string,
  t: TFunction,
  locale: string,
  now: number = Date.now(),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const diffMs = date.getTime() - now;
  const absolute = Math.abs(diffMs);
  const isFuture = diffMs > 0;
  if (absolute < minute) {
    return ticketText(t, "relativeTime.justNow");
  }
  if (absolute < hour) {
    return relative(t, isFuture, "Minutes", Math.round(absolute / minute));
  }
  if (absolute < day) {
    return relative(t, isFuture, "Hours", Math.round(absolute / hour));
  }
  const days = Math.round(absolute / day);
  if (days === 1) {
    return ticketText(t, isFuture ? "relativeTime.tomorrow" : "relativeTime.yesterday");
  }
  if (days <= relativeDaysLimit) {
    return relative(t, isFuture, "Days", days);
  }
  return formatTicketTimestamp(value, locale);
}

function relative(
  t: TFunction,
  isFuture: boolean,
  unit: "Minutes" | "Hours" | "Days",
  count: number,
): string {
  return ticketText(t, `relativeTime.${isFuture ? "in" : "ago"}${unit}`, { count });
}
