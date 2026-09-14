import type { TicketResponse } from "@/services/tickets-api";

export const dashboardVolumeDayCount = 14;

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
      d: formatDayMonthLabel(date),
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

function formatDayMonthLabel(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
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
