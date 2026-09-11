import type { TicketCsatBucket, TicketCsatRecord, TicketCsatSummary } from './csat.types';
import type { TicketRecord } from '../tickets.types';

export function aggregateTicketCsat(
  rows: readonly { ticket: TicketRecord; submission: TicketCsatRecord }[],
): TicketCsatSummary {
  return {
    count: rows.length,
    average: average(rows.map((row) => row.submission.rating)),
    byOriginUnit: buckets(rows, (row) => row.ticket.originUnitId),
    byService: buckets(rows, (row) => row.ticket.serviceId),
    byGroup: buckets(rows, (row) => row.ticket.assignedGroupId ?? ''),
  };
}

function buckets(
  rows: readonly { ticket: TicketRecord; submission: TicketCsatRecord }[],
  keyFor: (row: { ticket: TicketRecord; submission: TicketCsatRecord }) => string,
): TicketCsatBucket[] {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const key = keyFor(row);
    if (key.length === 0) {
      continue;
    }
    const current = grouped.get(key) ?? [];
    current.push(row.submission.rating);
    grouped.set(key, current);
  }
  return [...grouped.entries()]
    .map(([key, ratings]) => ({
      key,
      count: ratings.length,
      average: average(ratings) ?? 0,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
