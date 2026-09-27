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

/** Sums and counts behind the KPI cards — what the SQL store returns. */
export type ReportDashboardKpiTotals = {
  readonly createdCount: number;
  readonly previousCreatedCount: number;
  readonly firstResponse: ReportDashboardSample;
  readonly previousFirstResponse: ReportDashboardSample;
  /** Hours. */
  readonly resolution: ReportDashboardSample;
  readonly previousResolution: ReportDashboardSample;
  readonly csat: ReportDashboardSample;
  readonly kbHelpedCount: number;
};

/** First response in minutes, resolution in hours, CSAT in points. */
export type ReportDashboardSample = { readonly sum: number; readonly count: number };

export function aggregateReportDashboardKpis(input: {
  readonly tickets: readonly ReportTicketSnapshot[];
  readonly csatByTicketId: ReadonlyMap<string, TicketCsatRecord>;
  readonly window: ReportWindow;
  readonly previousWindow: ReportWindow;
  readonly kbHelpedCount?: number;
}): ReportDashboardKpis {
  return reportDashboardKpisFromTotals({
    createdCount: countCreated(input.tickets, input.window),
    previousCreatedCount: countCreated(input.tickets, input.previousWindow),
    firstResponse: firstResponseMinutes(input.tickets, input.window),
    previousFirstResponse: firstResponseMinutes(input.tickets, input.previousWindow),
    resolution: resolutionHours(input.tickets, input.window),
    previousResolution: resolutionHours(input.tickets, input.previousWindow),
    csat: csatRatings(input.tickets, input.csatByTicketId, input.window),
    kbHelpedCount: input.kbHelpedCount ?? 0,
  });
}

export function reportDashboardKpisFromTotals(
  totals: ReportDashboardKpiTotals,
): ReportDashboardKpis {
  const firstResponse = averageOf(totals.firstResponse);
  const previousFirstResponse = averageOf(totals.previousFirstResponse);
  const resolution = roundedAverageOf(totals.resolution);
  const previousResolution = roundedAverageOf(totals.previousResolution);
  const kbDenominator = totals.kbHelpedCount + totals.createdCount;
  return {
    createdCount: totals.createdCount,
    createdDeltaPercent: percentChange(totals.createdCount, totals.previousCreatedCount),
    firstResponseMinutes: firstResponse,
    firstResponseSampleCount: totals.firstResponse.count,
    firstResponseDeltaMinutes: deltaWhenBoth(firstResponse, previousFirstResponse),
    resolutionHours: resolution,
    resolutionSampleCount: totals.resolution.count,
    resolutionDeltaHours: deltaWhenBoth(resolution, previousResolution),
    csatAverage: roundedAverageOf(totals.csat),
    csatCount: totals.csat.count,
    csatScaleMax: 5,
    kbHelpedCount: totals.kbHelpedCount,
    kbResolutionRate:
      kbDenominator === 0 ? null : totals.kbHelpedCount / kbDenominator,
  };
}

function countCreated(
  tickets: readonly ReportTicketSnapshot[],
  window: ReportWindow,
): number {
  return tickets.filter((ticket) => isInWindow(ticket.createdAt, window))
    .length;
}

function firstResponseMinutes(
  tickets: readonly ReportTicketSnapshot[],
  window: ReportWindow,
): ReportDashboardSample {
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
  return sampleOf(samples);
}

function resolutionHours(
  tickets: readonly ReportTicketSnapshot[],
  window: ReportWindow,
): ReportDashboardSample {
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
  return sampleOf(samples);
}

function csatRatings(
  tickets: readonly ReportTicketSnapshot[],
  csatByTicketId: ReadonlyMap<string, TicketCsatRecord>,
  window: ReportWindow,
): ReportDashboardSample {
  const ratings: number[] = [];
  for (const ticket of tickets) {
    if (!isInWindow(ticket.createdAt, window)) {
      continue;
    }
    const csat = csatByTicketId.get(ticket.id);
    if (csat !== undefined) {
      ratings.push(csat.rating);
    }
  }
  return sampleOf(ratings);
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

function sampleOf(values: readonly number[]): ReportDashboardSample {
  return {
    sum: values.reduce((total, value) => total + value, 0),
    count: values.length,
  };
}

function averageOf(sample: ReportDashboardSample): number | null {
  return sample.count === 0 ? null : sample.sum / sample.count;
}

function roundedAverageOf(sample: ReportDashboardSample): number | null {
  const average = averageOf(sample);
  return average === null ? null : roundToOneDecimal(average);
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
