import { dateTimeFormatter } from "@/lib/date-time-formatter";
import i18next from "i18next";
import type { TicketResponse } from "@/services/tickets-api";

export const dashboardVolumeDayCount = 14;

/**
 * Val 1 grafik se broji iz tiketa kreiranih u periodu. Stranice,
 * njihov broj i granica „donja granica“ žive u `load-dashboard-volume.ts` —
 * veličina stranice tamo prati ono što API stvarno prihvata.
 *
 * Val 6.1 / modul 4 (D12): oznake dana se formatiraju preko `Intl.DateTimeFormat`
 * sa aktivnim jezikom aplikacije, tako da engleski korisnik ne vidi „13. 10“.
 */

export type TicketVolumeDay = {
  readonly d: string;
  readonly created: number;
  readonly resolved: number;
};

export function buildVolume14d(
  tickets: readonly TicketResponse[],
  now: Date,
): readonly TicketVolumeDay[] {
  const days = Array.from({ length: dashboardVolumeDayCount }, (_, index) => {
    const date = localDateOffset(now, index - (dashboardVolumeDayCount - 1));
    return {
      d: formatDayMonthLabel(date, i18next.language),
      key: localDayKey(date),
      created: 0,
      resolved: 0,
    };
  });
  const indexByKey = new Map(days.map((day, index) => [day.key, index] as const));

  for (const ticket of tickets) {
    incrementDay(days, indexByKey, ticket.createdAt, "created");
    incrementDay(days, indexByKey, resolvedAtForVolume(ticket), "resolved");
  }

  return days.map(({ d, created, resolved }) => ({ d, created, resolved }));
}

export function isSameLocalDay(isoTimestamp: string, now: Date): boolean {
  const key = localDayKeyFromIso(isoTimestamp);
  return key !== null && key === localDayKey(now);
}

function incrementDay(
  days: Array<{ created: number; resolved: number }>,
  indexByKey: ReadonlyMap<string, number>,
  isoTimestamp: string | null,
  field: "created" | "resolved",
): void {
  if (isoTimestamp === null) {
    return;
  }
  const key = localDayKeyFromIso(isoTimestamp);
  const index = key === null ? undefined : indexByKey.get(key);
  if (index === undefined) {
    return;
  }
  days[index][field] += 1;
}

function resolvedAtForVolume(ticket: TicketResponse): string | null {
  if (ticket.resolvedAt) {
    return ticket.resolvedAt;
  }
  if (ticket.status === "CLOSED" && ticket.closedAt) {
    return ticket.closedAt;
  }
  if (ticket.status === "ARCHIVED" && ticket.archivedAt) {
    return ticket.archivedAt;
  }
  return null;
}

function localDateOffset(now: Date, dayOffset: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
}

const dayLabelFormatter = new Map<string, Intl.DateTimeFormat>();

function dayFormatterFor(language: string): Intl.DateTimeFormat {
  const existing = dayLabelFormatter.get(language);
  if (existing !== undefined) {
    return existing;
  }
  const formatter = dateTimeFormatter(language, {
    day: "2-digit",
    month: "2-digit",
  });
  dayLabelFormatter.set(language, formatter);
  return formatter;
}

function formatDayMonthLabel(date: Date, language: string): string {
  // `Intl.DateTimeFormat` honours the user's locale; we ask for two-digit
  // day/month and replace any stray weirdness (e.g. two-digit years in some
  // regions) with the expected "dd. MM" shape by splitting and padding.
  const parts = dayFormatterFor(language).formatToParts(date);
  const day =
    parts.find((part) => part.type === "day")?.value ?? String(date.getDate()).padStart(2, "0");
  const month =
    parts.find((part) => part.type === "month")?.value ??
    String(date.getMonth() + 1).padStart(2, "0");
  return `${day}. ${month}`;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function localDayKeyFromIso(isoTimestamp: string): string | null {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return localDayKey(parsed);
}
