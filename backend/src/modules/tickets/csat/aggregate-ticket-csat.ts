import type { TicketCsatBucket, TicketCsatRecord, TicketCsatSummary } from './csat.types';
import type { TicketRecord } from '../tickets.types';

/**
 * Val 1 (M9/B3): razrez je prikazivao samo ID-eve. Nazive razrješava server
 * (`load-ticket-display-labels`), a ovdje se samo pridružuju — bez mape ili bez
 * pogotka labela je ključ, nikad prazan string.
 */
export type TicketCsatBucketLabels = {
  readonly originUnits?: ReadonlyMap<string, string>;
  readonly services?: ReadonlyMap<string, string>;
  readonly groups?: ReadonlyMap<string, string>;
};

export function aggregateTicketCsat(
  rows: readonly { ticket: TicketRecord; submission: TicketCsatRecord }[],
  scaleMax: number,
  labels: TicketCsatBucketLabels = {},
): TicketCsatSummary {
  return {
    count: rows.length,
    average: average(rows.map((row) => row.submission.rating)),
    scaleMax,
    satisfiedMinRating: satisfiedMinRating(scaleMax),
    byOriginUnit: buckets(
      rows,
      (row) => row.ticket.originUnitId,
      labels.originUnits,
    ),
    byService: buckets(rows, (row) => row.ticket.serviceId, labels.services),
    byGroup: buckets(
      rows,
      (row) => row.ticket.assignedGroupId ?? '',
      labels.groups,
    ),
  };
}

function buckets(
  rows: readonly { ticket: TicketRecord; submission: TicketCsatRecord }[],
  keyFor: (row: { ticket: TicketRecord; submission: TicketCsatRecord }) => string,
  labels: ReadonlyMap<string, string> | undefined,
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
      label: labels?.get(key) ?? key,
      count: ratings.length,
      average: average(ratings) ?? 0,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * Prag „zadovoljan“ je 80 % skale: na skali 5 to je 4 (kako se do sada
 * tumačilo), na skali 10 je 8. Zaokružuje se naviše, najmanje 1.
 */
export function satisfiedMinRating(scaleMax: number): number {
  return Math.max(1, Math.ceil(scaleMax * 0.8));
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
