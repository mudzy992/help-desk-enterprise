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
  const createdByDay = new Map<string, number>();
  const resolvedByDay = new Map<string, number>();
  for (const ticket of input.tickets) {
    countDay(createdByDay, ticket.createdAt);
    countDay(resolvedByDay, ticket.resolvedAt);
  }
  return buildReportVolumeSeries({ window: input.window, createdByDay, resolvedByDay });
}

/** `YYYY-MM-DD` of the UTC calendar day — the key the SQL store groups by. */
export function utcDayKeyOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function countDay(counts: Map<string, number>, value: Date | null): void {
  if (value === null) {
    return;
  }
  const key = utcDayKeyOf(value);
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Buckets per-UTC-day counts into the dashboard series (daily up to 31 days,
 * otherwise 14 equal chunks). Shared by the in-memory and the SQL dashboard.
 */
export function buildReportVolumeSeries(input: {
  readonly window: ReportWindow;
  readonly createdByDay: ReadonlyMap<string, number>;
  readonly resolvedByDay: ReadonlyMap<string, number>;
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
  for (const [key, count] of input.createdByDay) {
    const index = indexByKey.get(key);
    if (index !== undefined) buckets[index].created += count;
  }
  for (const [key, count] of input.resolvedByDay) {
    const index = indexByKey.get(key);
    if (index !== undefined) buckets[index].resolved += count;
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

function utcDayKey(date: Date): string {
  return utcDayKeyOf(date);
}

function formatDayMonthLabel(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}. ${month}`;
}
