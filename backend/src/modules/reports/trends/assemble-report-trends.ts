import type { ReportTrendBucketPlan } from './build-report-trend-buckets';
import {
  reportCsatSatisfiedMinRating,
  reportCsatScaleMax,
  reportTrendTopServiceLimit,
} from './report-trends.constants';
import type {
  ReportTrendCsat,
  ReportTrendCsatRow,
  ReportTrendDuration,
  ReportTrendFlowKind,
  ReportTrendFlowRow,
  ReportTrendPoint,
  ReportTrendRatio,
  ReportTrendRawData,
  ReportTrends,
  ReportTrendsQuery,
  ReportTrendService,
} from './report-trends.types';

/** Paket 2.5 (design §3): raw aggregates → the series the UI, e-mail and CSV share. */
export function assembleReportTrends(input: {
  readonly plan: ReportTrendBucketPlan;
  readonly raw: ReportTrendRawData;
  readonly query: ReportTrendsQuery;
  readonly timeZone: string;
  readonly slaTargetPercent: number;
  readonly csatMinSample: number;
  readonly now: Date;
  readonly unknownServiceLabel?: string;
}): ReportTrends {
  const { plan, raw } = input;
  const flow = indexFlow(raw.flow);
  const csatByBucket = new Map(raw.csat.map((row) => [row.bucket, row]));
  const openAtStart = flow.get(key('openAtStart', 0))?.count ?? 0;
  let backlog = openAtStart;
  const points: ReportTrendPoint[] = plan.buckets.map((bucket, index) => {
    const position = index + 1;
    const created = flow.get(key('created', position));
    const resolved = flow.get(key('resolved', position));
    const createdCount = created?.count ?? 0;
    const resolvedCount = resolved?.count ?? 0;
    backlog += createdCount - resolvedCount;
    return {
      key: bucket.key,
      start: bucket.start.toISOString(),
      end: bucket.end.toISOString(),
      partial: bucket.partial,
      created: createdCount,
      resolved: resolvedCount,
      net: createdCount - resolvedCount,
      backlog,
      firstResponse: duration(created),
      resolution: duration(resolved),
      slaResponse: ratio(flow.get(key('slaResponse', position))),
      slaResolution: ratio(flow.get(key('slaResolution', position))),
      csat: csat(csatByBucket.get(position), input.csatMinSample),
    };
  });
  const sum = (pick: (point: ReportTrendPoint) => number) =>
    points.reduce((total, point) => total + pick(point), 0);
  const csatTotals = raw.csat.reduce(
    (total, row) => ({
      bucket: 0,
      count: total.count + row.count,
      ratingSum: total.ratingSum + row.ratingSum,
      satisfied: total.satisfied + row.satisfied,
    }),
    { bucket: 0, count: 0, ratingSum: 0, satisfied: 0 } as ReportTrendCsatRow,
  );
  const first = plan.buckets[0];
  const last = plan.buckets[plan.buckets.length - 1];
  return {
    granularity: plan.granularity,
    timeZone: input.timeZone,
    window: {
      from: (first?.start ?? plan.previous.end).toISOString(),
      to: (last?.end ?? plan.previous.end).toISOString(),
    },
    previousWindow: {
      from: plan.previous.start.toISOString(),
      to: plan.previous.end.toISOString(),
    },
    generatedAt: input.now.toISOString(),
    filters: {
      organizationalUnitId: input.query.organizationalUnitId,
      serviceId: input.query.serviceId ?? null,
      groupId: input.query.groupId ?? null,
      priority: input.query.priority ?? null,
    },
    points,
    totals: {
      created: sum((point) => point.created),
      resolved: sum((point) => point.resolved),
      net: sum((point) => point.net),
      backlogStart: openAtStart,
      backlogEnd: backlog,
      slaResponse: toRatio(
        sum((point) => point.slaResponse.total),
        sum((point) => point.slaResponse.met),
      ),
      slaResolution: toRatio(
        sum((point) => point.slaResolution.total),
        sum((point) => point.slaResolution.met),
      ),
      csat: csat(csatTotals, input.csatMinSample),
      resolvedWithoutSla: flow.get(key('resolvedWithoutSla', 0))?.count ?? 0,
    },
    topServices: topServices(raw, input.unknownServiceLabel),
    settings: {
      slaTargetPercent: input.slaTargetPercent,
      csatMinSample: input.csatMinSample,
      csatScaleMax: reportCsatScaleMax,
      csatSatisfiedMinRating: reportCsatSatisfiedMinRating,
    },
  };
}

function key(kind: ReportTrendFlowKind, bucket: number): string {
  return `${kind}:${bucket}`;
}

function indexFlow(rows: readonly ReportTrendFlowRow[]): Map<string, ReportTrendFlowRow> {
  return new Map(rows.map((row) => [key(row.kind, row.bucket), row]));
}

function duration(row: ReportTrendFlowRow | undefined): ReportTrendDuration {
  return {
    medianHours: toHours(row?.p50Seconds ?? null),
    p90Hours: toHours(row?.p90Seconds ?? null),
    sampleCount: row?.sampleCount ?? 0,
  };
}

function ratio(row: ReportTrendFlowRow | undefined): ReportTrendRatio {
  return toRatio(row?.count ?? 0, row?.met ?? 0);
}

function toRatio(total: number, met: number): ReportTrendRatio {
  return { total, met, percent: total === 0 ? null : roundOne((met / total) * 100) };
}

function csat(row: ReportTrendCsatRow | undefined, minSample: number): ReportTrendCsat {
  const count = row?.count ?? 0;
  if (row === undefined || count === 0) {
    return { count: 0, average: null, satisfiedPercent: null, lowSample: true };
  }
  return {
    count,
    average: Math.round((row.ratingSum / count) * 100) / 100,
    satisfiedPercent: roundOne((row.satisfied / count) * 100),
    lowSample: count < minSample,
  };
}

function topServices(
  raw: ReportTrendRawData,
  unknownServiceLabel = 'Unknown service',
): ReportTrends['topServices'] {
  const rows = [...raw.services]
    .filter((row) => row.current > 0 || row.previous > 0)
    .sort(
      (left, right) =>
        right.current - left.current ||
        right.previous - left.previous ||
        (left.name ?? '').localeCompare(right.name ?? '') ||
        left.serviceId.localeCompare(right.serviceId),
    );
  const top = rows.filter((row) => row.current > 0).slice(0, reportTrendTopServiceLimit);
  const topIds = new Set(top.map((row) => row.serviceId));
  const rest = rows.filter((row) => !topIds.has(row.serviceId));
  const items: ReportTrendService[] = top.map((row) => ({
    serviceId: row.serviceId,
    name: row.name ?? unknownServiceLabel,
    current: row.current,
    previous: row.previous,
    changePercent: percentChange(row.current, row.previous),
  }));
  return {
    items,
    other: {
      current: rest.reduce((total, row) => total + row.current, 0),
      previous: rest.reduce((total, row) => total + row.previous, 0),
    },
    totalCurrent: rows.reduce((total, row) => total + row.current, 0),
    totalPrevious: rows.reduce((total, row) => total + row.previous, 0),
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function toHours(seconds: number | null): number | null {
  return seconds === null ? null : roundOne(seconds / 3600);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
