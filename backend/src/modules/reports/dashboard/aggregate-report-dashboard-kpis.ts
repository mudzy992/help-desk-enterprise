import type { TicketCsatRecord } from '../../tickets/csat/csat.types';
import type { ReportTicketSnapshot, ReportWindow } from '../reports.types';

export type ReportDashboardKpis = {
  readonly createdCount: number;
  readonly createdDeltaPercent: number | null;
  readonly firstResponseMinutes: number | null;
  readonly firstResponseSampleCount: number;
  readonly firstResponseDeltaMinutes: number | null;
  readonly resolutionHours: number | null;
  readonly resolutionSampleCount: number;
  readonly resolutionDeltaHours: number | null;
  readonly csatAverage: number | null;
  readonly csatCount: number;
  readonly csatScaleMax: number;
  readonly kbHelpedCount: number;
  readonly kbResolutionRate: number | null;
};

export function previousReportWindow(window: ReportWindow): ReportWindow {
  const durationMs = window.to.getTime() - window.from.getTime();
  return {
    from: new Date(window.from.getTime() - durationMs),
    to: new Date(window.from.getTime() - 1),
  };
}

export function aggregateReportDashboardKpis(input: {
  readonly tickets: readonly ReportTicketSnapshot[];
  readonly csatByTicketId: ReadonlyMap<string, TicketCsatRecord>;
  readonly window: ReportWindow;
  readonly previousWindow: ReportWindow;
  readonly kbHelpedCount?: number;
}): ReportDashboardKpis {
  const createdCount = countCreated(input.tickets, input.window);
  const previousCreated = countCreated(input.tickets, input.previousWindow);
  const firstResponse = averageFirstResponseMinutes(
    input.tickets,
    input.window,
  );
  const previousFirstResponse = averageFirstResponseMinutes(
    input.tickets,
    input.previousWindow,
  );
  const resolution = averageResolutionHours(input.tickets, input.window);
  const previousResolution = averageResolutionHours(
    input.tickets,
    input.previousWindow,
  );
  const csat = averageCsat(
    input.tickets,
    input.csatByTicketId,
    input.window,
  );
  const kbHelpedCount = input.kbHelpedCount ?? 0;
  const kbDenominator = kbHelpedCount + createdCount;
  return {
    createdCount,
    createdDeltaPercent: percentChange(createdCount, previousCreated),
    firstResponseMinutes: firstResponse.average,
    firstResponseSampleCount: firstResponse.count,
    firstResponseDeltaMinutes: deltaWhenBoth(
      firstResponse.average,
      previousFirstResponse.average,
    ),
    resolutionHours: resolution.average,
    resolutionSampleCount: resolution.count,
    resolutionDeltaHours: deltaWhenBoth(
      resolution.average,
      previousResolution.average,
    ),
    csatAverage: csat.average,
    csatCount: csat.count,
    csatScaleMax: csat.scaleMax,
    kbHelpedCount,
    kbResolutionRate:
      kbDenominator === 0 ? null : kbHelpedCount / kbDenominator,
  };
}

function countCreated(
  tickets: readonly ReportTicketSnapshot[],
  window: ReportWindow,
): number {
  return tickets.filter((ticket) => isInWindow(ticket.createdAt, window))
    .length;
}

function averageFirstResponseMinutes(
  tickets: readonly ReportTicketSnapshot[],
  window: ReportWindow,
): { average: number | null; count: number } {
  const samples: number[] = [];
  for (const ticket of tickets) {
    if (!isInWindow(ticket.createdAt, window) || ticket.firstResponseAt === null) {
      continue;
    }
    const minutes = elapsedMinutes(ticket.createdAt, ticket.firstResponseAt);
    if (minutes !== null) {
      samples.push(minutes);
    }
  }
  return averageOf(samples);
}

function averageResolutionHours(
  tickets: readonly ReportTicketSnapshot[],
  window: ReportWindow,
): { average: number | null; count: number } {
  const samples: number[] = [];
  for (const ticket of tickets) {
    if (ticket.resolvedAt === null || !isInWindow(ticket.resolvedAt, window)) {
      continue;
    }
    const hours = elapsedHours(ticket.createdAt, ticket.resolvedAt);
    if (hours !== null) {
      samples.push(hours);
    }
  }
  const result = averageOf(samples);
  return {
    average:
      result.average === null ? null : roundToOneDecimal(result.average),
    count: result.count,
  };
}

function averageCsat(
  tickets: readonly ReportTicketSnapshot[],
  csatByTicketId: ReadonlyMap<string, TicketCsatRecord>,
  window: ReportWindow,
): { average: number | null; count: number; scaleMax: number } {
  const ratings: number[] = [];
  for (const ticket of tickets) {
    if (!isInWindow(ticket.createdAt, window)) {
      continue;
    }
    const csat = csatByTicketId.get(ticket.id);
    if (csat === undefined) {
      continue;
    }
    ratings.push(csat.rating);
  }
  const average = averageOf(ratings);
  return {
    average:
      average.average === null ? null : roundToOneDecimal(average.average),
    count: average.count,
    scaleMax: 5,
  };
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

function elapsedMinutes(start: Date, end: Date): number | null {
  const hours = elapsedHours(start, end);
  return hours === null ? null : hours * 60;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function averageOf(
  values: readonly number[],
): { average: number | null; count: number } {
  if (values.length === 0) {
    return { average: null, count: 0 };
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return { average: sum / values.length, count: values.length };
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function deltaWhenBoth(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) {
    return null;
  }
  return roundToOneDecimal(current - previous);
}
