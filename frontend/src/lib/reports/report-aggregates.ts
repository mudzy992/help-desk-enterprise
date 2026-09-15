import {
  isTimestampInWindow,
  type ReportWindow,
} from "@/lib/reports/report-window";
import {
  elapsedHours,
  elapsedMinutes,
  roundToOneDecimal,
  ticketFirstRespondedAt,
  ticketResolvedAt,
} from "@/lib/reports/report-ticket-fields";
import type { TicketResponse } from "@/services/tickets-api";

export type ReportKpis = {
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
};

export function buildReportKpis(
  tickets: readonly TicketResponse[],
  window: ReportWindow,
  previousWindow: ReportWindow,
): ReportKpis {
  const createdCount = countCreated(tickets, window);
  const previousCreated = countCreated(tickets, previousWindow);
  const firstResponse = averageFirstResponseMinutes(tickets, window);
  const previousFirstResponse = averageFirstResponseMinutes(
    tickets,
    previousWindow,
  );
  const resolution = averageResolutionHours(tickets, window);
  const previousResolution = averageResolutionHours(tickets, previousWindow);
  const csat = averageCsat(tickets, window);
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
  };
}

function countCreated(
  tickets: readonly TicketResponse[],
  window: ReportWindow,
): number {
  return tickets.filter((ticket) =>
    isTimestampInWindow(ticket.createdAt, window),
  ).length;
}

function averageFirstResponseMinutes(
  tickets: readonly TicketResponse[],
  window: ReportWindow,
): { average: number | null; count: number } {
  const samples: number[] = [];
  for (const ticket of tickets) {
    if (!isTimestampInWindow(ticket.createdAt, window)) {
      continue;
    }
    const respondedAt = ticketFirstRespondedAt(ticket);
    if (respondedAt === null) {
      continue;
    }
    const minutes = elapsedMinutes(ticket.createdAt, respondedAt);
    if (minutes !== null) {
      samples.push(minutes);
    }
  }
  return averageOf(samples);
}

function averageResolutionHours(
  tickets: readonly TicketResponse[],
  window: ReportWindow,
): { average: number | null; count: number } {
  const samples: number[] = [];
  for (const ticket of tickets) {
    const resolvedAt = ticketResolvedAt(ticket);
    if (resolvedAt === null || !isTimestampInWindow(resolvedAt, window)) {
      continue;
    }
    const hours = elapsedHours(ticket.createdAt, resolvedAt);
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
  tickets: readonly TicketResponse[],
  window: ReportWindow,
): { average: number | null; count: number; scaleMax: number } {
  const ratings: number[] = [];
  let scaleMax = 5;
  for (const ticket of tickets) {
    if (!isTimestampInWindow(ticket.createdAt, window)) {
      continue;
    }
    const rating = ticket.csat?.rating;
    if (rating === undefined || rating === null) {
      continue;
    }
    ratings.push(rating);
    scaleMax = ticket.csat?.scaleMax ?? scaleMax;
  }
  const average = averageOf(ratings);
  return {
    average:
      average.average === null ? null : roundToOneDecimal(average.average),
    count: average.count,
    scaleMax,
  };
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
