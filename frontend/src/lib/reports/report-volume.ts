import type { GroupedBarDatum } from "@/components/charts/grouped-bars";
import {
  enumerateLocalDays,
  startOfLocalDay,
  type ReportWindow,
} from "@/lib/reports/report-window";
import { ticketResolvedAt } from "@/lib/reports/report-ticket-fields";
import type { TicketResponse } from "@/services/tickets-api";

const reportVolumeDailyLimit = 31;
const reportVolumeBucketCount = 14;

export function buildReportVolumeSeries(
  tickets: readonly TicketResponse[],
  window: ReportWindow,
): readonly GroupedBarDatum[] {
  const days = enumerateLocalDays(window);
  if (days.length === 0) {
    return [];
  }
  const buckets =
    days.length <= reportVolumeDailyLimit
      ? days.map((day) => ({
          d: formatDayMonthLabel(day),
          keys: new Set([localDayKey(day)]),
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
  for (const ticket of tickets) {
    incrementBucket(buckets, indexByKey, ticket.createdAt, "created");
    incrementBucket(
      buckets,
      indexByKey,
      ticketResolvedAt(ticket),
      "resolved",
    );
  }
  return buckets.map(({ d, created, resolved }) => ({ d, created, resolved }));
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
      keys: new Set(slice.map(localDayKey)),
      created: 0,
      resolved: 0,
    });
  }
  return buckets;
}

function incrementBucket(
  buckets: Array<{ created: number; resolved: number }>,
  indexByKey: ReadonlyMap<string, number>,
  isoTimestamp: string | null,
  field: "created" | "resolved",
): void {
  if (isoTimestamp === null) {
    return;
  }
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return;
  }
  const index = indexByKey.get(localDayKey(startOfLocalDay(parsed)));
  if (index === undefined) {
    return;
  }
  buckets[index][field] += 1;
}

function formatDayMonthLabel(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}. ${month}`;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
