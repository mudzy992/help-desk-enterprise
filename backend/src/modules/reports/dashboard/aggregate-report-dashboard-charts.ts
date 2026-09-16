import type { ReportTicketSnapshot, ReportWindow } from '../reports.types';

export const reportChartBarLimit = 8;

const terminalStatuses = new Set(['RESOLVED', 'CLOSED', 'ARCHIVED']);

export type ReportDashboardNamedBar = {
  readonly key: string;
  readonly label: string;
  readonly value: number;
};

export type ReportDashboardAging = {
  readonly lessThanOneDay: number;
  readonly oneToThreeDays: number;
  readonly threeToSevenDays: number;
  readonly moreThanSevenDays: number;
  readonly waitingOverSevenDays: number;
};

export function aggregateBottleneckHoursByGroup(input: {
  readonly tickets: readonly ReportTicketSnapshot[];
  readonly window: ReportWindow;
  readonly groupNames: ReadonlyMap<string, string>;
  readonly unroutedLabel: string;
}): readonly ReportDashboardNamedBar[] {
  const totals = new Map<string, { hours: number; count: number }>();
  for (const ticket of input.tickets) {
    if (
      ticket.resolvedAt === null ||
      !isInWindow(ticket.resolvedAt, input.window)
    ) {
      continue;
    }
    const hours = elapsedHours(ticket.createdAt, ticket.resolvedAt);
    if (hours === null) {
      continue;
    }
    const key = ticket.assignedGroupId ?? '';
    const current = totals.get(key) ?? { hours: 0, count: 0 };
    totals.set(key, {
      hours: current.hours + hours,
      count: current.count + 1,
    });
  }
  return [...totals.entries()]
    .map(([key, total]) => ({
      key,
      label:
        key.length === 0
          ? input.unroutedLabel
          : (input.groupNames.get(key) ?? key),
      value: roundToOneDecimal(total.hours / total.count),
    }))
    .sort(
      (left, right) =>
        right.value - left.value || left.label.localeCompare(right.label),
    )
    .slice(0, reportChartBarLimit);
}

export function aggregateServiceVolume(input: {
  readonly tickets: readonly ReportTicketSnapshot[];
  readonly window: ReportWindow;
  readonly serviceNames: ReadonlyMap<string, string>;
}): readonly ReportDashboardNamedBar[] {
  const counts = new Map<string, number>();
  for (const ticket of input.tickets) {
    if (!isInWindow(ticket.createdAt, input.window)) {
      continue;
    }
    counts.set(ticket.serviceId, (counts.get(ticket.serviceId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, value]) => ({
      key,
      label: input.serviceNames.get(key) ?? key,
      value,
    }))
    .sort(
      (left, right) =>
        right.value - left.value || left.label.localeCompare(right.label),
    )
    .slice(0, reportChartBarLimit);
}

export function aggregateAgingBuckets(input: {
  readonly tickets: readonly ReportTicketSnapshot[];
  readonly now: Date;
}): ReportDashboardAging {
  const buckets = {
    lessThanOneDay: 0,
    oneToThreeDays: 0,
    threeToSevenDays: 0,
    moreThanSevenDays: 0,
  };
  let waitingOverSevenDays = 0;
  for (const ticket of input.tickets) {
    if (terminalStatuses.has(ticket.status)) {
      continue;
    }
    const ageHours = elapsedHours(ticket.createdAt, input.now);
    if (ageHours === null) {
      continue;
    }
    const days = ageHours / 24;
    if (days < 1) {
      buckets.lessThanOneDay += 1;
    } else if (days < 3) {
      buckets.oneToThreeDays += 1;
    } else if (days < 7) {
      buckets.threeToSevenDays += 1;
    } else {
      buckets.moreThanSevenDays += 1;
      if (ticket.status === 'WAITING_FOR_USER') {
        waitingOverSevenDays += 1;
      }
    }
  }
  return { ...buckets, waitingOverSevenDays };
}

function isInWindow(value: Date | null, window: ReportWindow): boolean {
  if (value === null) {
    return false;
  }
  const time = value.getTime();
  return time >= window.from.getTime() && time <= window.to.getTime();
}

function elapsedHours(start: Date, end: Date): number | null {
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  return hours < 0 ? null : hours;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
