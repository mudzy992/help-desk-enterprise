import type { ReportTicketSnapshot, ReportWindow } from '../reports.types';

export const reportVolumeDailyLimit = 31;
export const reportVolumeBucketCount = 14;

export type ReportDashboardVolumePoint = {
  readonly d: string;
  readonly created: number;
  readonly resolved: number;
};

export function aggregateReportVolumeSeries(input: {
  readonly tickets: readonly ReportTicketSnapshot[];
  readonly window: ReportWindow;
}): readonly ReportDashboardVolumePoint[] {
  const days = enumerateUtcDays(input.window);
  if (days.length === 0) {
    return [];
  }
  const buckets =
    days.length <= reportVolumeDailyLimit
      ? days.map((day) => ({
          d: formatDayMonthLabel(day),
          keys: new Set([utcDayKey(day)]),
          created: 0,
          resolved: 0,
        }))
      : chunkDays(days, reportVolumeBucketCount);
  const indexByKey = new Map<string, number>();
  buckets.forEach((bucket, index) => {
    for (const key of bucket.keys) {
      indexByKey.set(key, index);
    }
  });
  for (const ticket of input.tickets) {
    incrementBucket(buckets, indexByKey, ticket.createdAt, 'created');
    incrementBucket(buckets, indexByKey, ticket.resolvedAt, 'resolved');
  }
  return buckets.map(({ d, created, resolved }) => ({ d, created, resolved }));
}

function enumerateUtcDays(window: ReportWindow): Date[] {
  const days: Date[] = [];
  let cursor = Date.UTC(
    window.from.getUTCFullYear(),
    window.from.getUTCMonth(),
    window.from.getUTCDate(),
  );
  const last = Date.UTC(
    window.to.getUTCFullYear(),
    window.to.getUTCMonth(),
    window.to.getUTCDate(),
  );
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor += 24 * 60 * 60 * 1000;
  }
  return days;
}

function chunkDays(
  days: readonly Date[],
  bucketCount: number,
): Array<{
  d: string;
  keys: Set<string>;
  created: number;
  resolved: number;
}> {
  const size = Math.ceil(days.length / bucketCount);
  const buckets: Array<{
    d: string;
    keys: Set<string>;
    created: number;
    resolved: number;
  }> = [];
  for (let index = 0; index < days.length; index += size) {
    const slice = days.slice(index, index + size);
    const first = slice[0];
    if (first === undefined) {
      continue;
    }
    buckets.push({
      d: formatDayMonthLabel(first),
      keys: new Set(slice.map(utcDayKey)),
      created: 0,
      resolved: 0,
    });
  }
  return buckets;
}

function incrementBucket(
  buckets: Array<{ created: number; resolved: number }>,
  indexByKey: ReadonlyMap<string, number>,
  value: Date | null,
  field: 'created' | 'resolved',
): void {
  if (value === null) {
    return;
  }
  const index = indexByKey.get(
    utcDayKey(
      new Date(
        Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
      ),
    ),
  );
  if (index === undefined) {
    return;
  }
  buckets[index][field] += 1;
}

function utcDayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

function formatDayMonthLabel(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}. ${month}`;
}
