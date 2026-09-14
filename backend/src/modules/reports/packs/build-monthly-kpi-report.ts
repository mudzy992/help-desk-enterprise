import { isTimestampInWindow } from '../resolve-report-window';
import type { ReportExportRow, ReportPackBuildInput } from '../reports.types';

export const monthlyKpiColumns = [
  'createdCount',
  'resolvedCount',
  'closedCount',
  'overdueCount',
  'csatCount',
  'csatAverage',
  'averageFirstResponseMinutes',
  'averageResolutionMinutes',
] as const;

export function buildMonthlyKpiReport(
  input: ReportPackBuildInput,
): readonly ReportExportRow[] {
  const created = input.tickets.filter((ticket) =>
    isTimestampInWindow(ticket.createdAt, input.window),
  );
  const resolved = input.tickets.filter((ticket) =>
    isTimestampInWindow(ticket.resolvedAt, input.window),
  );
  const closed = input.tickets.filter((ticket) =>
    isTimestampInWindow(ticket.closedAt, input.window),
  );
  const csatRatings = created
    .map((ticket) => input.csatByTicketId.get(ticket.id)?.rating)
    .filter((rating): rating is number => rating !== undefined);
  return [
    {
      createdCount: created.length,
      resolvedCount: resolved.length,
      closedCount: closed.length,
      overdueCount: input.tickets.filter((ticket) => ticket.isOverdue).length,
      csatCount: csatRatings.length,
      csatAverage: average(csatRatings),
      averageFirstResponseMinutes: averageElapsedMinutes(
        created
          .filter((ticket) => ticket.firstResponseAt !== null)
          .map((ticket) => ({
            start: ticket.createdAt,
            end: ticket.firstResponseAt as Date,
          })),
      ),
      averageResolutionMinutes: averageElapsedMinutes(
        resolved
          .filter((ticket) => ticket.resolvedAt !== null)
          .map((ticket) => ({
            start: ticket.createdAt,
            end: ticket.resolvedAt as Date,
          })),
      ),
    },
  ];
}

function averageElapsedMinutes(
  pairs: readonly { readonly start: Date; readonly end: Date }[],
): number | null {
  if (pairs.length === 0) {
    return null;
  }
  const minutes = pairs.map(
    (pair) => (pair.end.getTime() - pair.start.getTime()) / 60_000,
  );
  return Math.round(average(minutes) ?? 0);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
