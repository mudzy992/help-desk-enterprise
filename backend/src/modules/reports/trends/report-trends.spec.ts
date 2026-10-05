jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { ReportsError } from '../reports.error';
import { buildReportTrendBuckets } from './build-report-trend-buckets';
import {
  InMemoryReportTrendSource,
  percentileCont,
  widthBucket,
  type ReportTrendDataset,
  type ReportTrendTicketFacts,
} from './in-memory-report-trend-source';
import { reportTrendsCacheKey } from './report-trends.cache';
import { ReportTrendsService } from './report-trends.service';
import { toReportTrendExportRows } from './report-trend-export-rows';
import type { ReportTrendsConfiguration } from './report-trends.types';

const zone = 'Europe/Sarajevo';

function codeOf(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof ReportsError ? error.code : 'OTHER';
  }
}

describe('buildReportTrendBuckets (design §3)', () => {
  const now = new Date('2026-11-15T10:00:00Z');

  it('aligns ISO weeks to Monday 00:00 local across both DST changes', () => {
    const spring = buildReportTrendBuckets({
      from: '2026-03-23',
      to: '2026-04-05',
      granularity: 'week',
      timeZone: zone,
      now,
      maxMonths: 36,
    });
    expect(spring.buckets.map((bucket) => [bucket.key, bucket.start.toISOString()])).toEqual([
      ['2026-03-23', '2026-03-22T23:00:00.000Z'],
      ['2026-03-30', '2026-03-29T22:00:00.000Z'],
    ]);
    // The DST week is one hour short, the bucket still ends at Monday 00:00 local.
    expect(spring.buckets[0]?.end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    const autumn = buildReportTrendBuckets({
      from: '2026-10-19',
      to: '2026-10-26',
      granularity: 'week',
      timeZone: zone,
      now,
      maxMonths: 36,
    });
    expect(autumn.buckets.map((bucket) => bucket.start.toISOString())).toEqual([
      '2026-10-18T22:00:00.000Z',
      '2026-10-25T23:00:00.000Z',
    ]);
  });

  it('snaps a mid-week start to Monday and a mid-month start to the 1st', () => {
    const weeks = buildReportTrendBuckets({ from: '2026-03-26', to: '2026-03-27', granularity: 'week', timeZone: zone, now, maxMonths: 36 });
    expect(weeks.buckets.map((bucket) => bucket.key)).toEqual(['2026-03-23']);
    const months = buildReportTrendBuckets({ from: '2026-01-17', to: '2026-02-02', granularity: 'month', timeZone: zone, now, maxMonths: 36 });
    expect(months.buckets.map((bucket) => bucket.key)).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('builds the previous window with the same number of buckets', () => {
    const plan = buildReportTrendBuckets({ from: '2026-01-01', to: '2026-03-31', granularity: 'month', timeZone: zone, now, maxMonths: 36 });
    expect(plan.previous.start.toISOString()).toBe('2025-09-30T22:00:00.000Z');
    expect(plan.previous.end.toISOString()).toBe('2025-12-31T23:00:00.000Z');
  });

  it('enforces the per-granularity limits (92 days, 104 weeks, maxMonths)', () => {
    const base = { timeZone: zone, now, maxMonths: 36 };
    expect(codeOf(() => buildReportTrendBuckets({ ...base, from: '2026-01-01', to: '2026-04-02', granularity: 'day' }))).toBeNull();
    expect(codeOf(() => buildReportTrendBuckets({ ...base, from: '2026-01-01', to: '2026-04-03', granularity: 'day' }))).toBe(
      'REPORT_WINDOW_INVALID',
    );
    expect(codeOf(() => buildReportTrendBuckets({ ...base, from: '2023-11-01', to: '2026-10-31', granularity: 'month' }))).toBeNull();
    expect(codeOf(() => buildReportTrendBuckets({ ...base, from: '2023-10-01', to: '2026-10-31', granularity: 'month' }))).toBe(
      'REPORT_WINDOW_INVALID',
    );
    expect(codeOf(() => buildReportTrendBuckets({ ...base, from: '2024-11-11', to: '2026-11-08', granularity: 'week' }))).toBeNull();
    expect(codeOf(() => buildReportTrendBuckets({ ...base, from: '2024-11-04', to: '2026-11-08', granularity: 'week' }))).toBe(
      'REPORT_WINDOW_INVALID',
    );
  });

  it('rejects reversed and impossible dates', () => {
    const base = { timeZone: zone, now, maxMonths: 36 };
    expect(codeOf(() => buildReportTrendBuckets({ ...base, from: '2026-03-01', to: '2026-02-01' }))).toBe('REPORT_WINDOW_INVALID');
    expect(codeOf(() => buildReportTrendBuckets({ ...base, from: '2026-02-30', to: '2026-03-01' }))).toBe('REPORT_WINDOW_INVALID');
  });

  it('picks the granularity automatically and clamps the end to today', () => {
    const base = { timeZone: zone, now, maxMonths: 36 };
    expect(buildReportTrendBuckets({ ...base, from: '2026-11-01', to: '2026-11-20' }).granularity).toBe('day');
    expect(buildReportTrendBuckets({ ...base, from: '2026-07-01', to: '2026-11-15' }).granularity).toBe('week');
    const months = buildReportTrendBuckets({ ...base, from: '2025-01-01', to: '2027-05-01' });
    expect(months.granularity).toBe('month');
    const last = months.buckets[months.buckets.length - 1];
    expect(last?.key).toBe('2026-11-01');
    expect(last?.partial).toBe(true);
    expect(months.buckets[0]?.partial).toBe(false);
  });

  it('defaults to the last 12 months', () => {
    const plan = buildReportTrendBuckets({ timeZone: zone, now, maxMonths: 36 });
    expect(plan.granularity).toBe('month');
    expect(plan.buckets).toHaveLength(12);
    expect(plan.buckets[0]?.key).toBe('2025-12-01');
  });
});

describe('PostgreSQL helpers mirrored in TypeScript', () => {
  it('widthBucket is 1-based and 0 below the first threshold', () => {
    expect(widthBucket(5, [10, 20, 30])).toBe(0);
    expect(widthBucket(10, [10, 20, 30])).toBe(1);
    expect(widthBucket(29, [10, 20, 30])).toBe(2);
    expect(widthBucket(30, [10, 20, 30])).toBe(3);
  });

  it('percentileCont interpolates linearly', () => {
    expect(percentileCont([], 0.5)).toBeNull();
    expect(percentileCont([4], 0.9)).toBe(4);
    expect(percentileCont([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentileCont([10, 0, 20, 30, 40], 0.9)).toBeCloseTo(36);
  });
});

function ticket(partial: Partial<ReportTrendTicketFacts> & { id: string; createdAt: Date }): ReportTrendTicketFacts {
  return {
    originUnitId: 'ou-it',
    serviceId: 'svc-vpn',
    assignedGroupId: 'grp-1',
    priority: 'MEDIUM',
    mergedIntoTicketId: null,
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    ...partial,
  };
}

const dataset: ReportTrendDataset = {
  tickets: [
    // Open before the window, resolved in January → backlog start 1, resolved Jan.
    ticket({ id: 't1', createdAt: new Date('2025-12-20T09:00:00Z'), resolvedAt: new Date('2026-01-10T09:00:00Z') }),
    // Sub-unit: created January, first response after 2 h, resolved February.
    ticket({
      id: 't2',
      originUnitId: 'ou-it-ops',
      createdAt: new Date('2026-01-05T10:00:00Z'),
      firstResponseAt: new Date('2026-01-05T12:00:00Z'),
      resolvedAt: new Date('2026-02-03T10:00:00Z'),
      serviceId: 'svc-mail',
    }),
    ticket({ id: 't3', createdAt: new Date('2026-02-10T08:00:00Z') }),
    // 00:30 local on 1 March is still February in UTC — it belongs to March.
    ticket({ id: 't4', createdAt: new Date('2026-02-28T23:30:00Z') }),
    // Merged: never counted.
    ticket({ id: 't5', createdAt: new Date('2026-01-07T08:00:00Z'), mergedIntoTicketId: 't3' }),
    // Another unit: never counted.
    ticket({ id: 't6', originUnitId: 'ou-hr', createdAt: new Date('2026-01-07T08:00:00Z') }),
    // Closed without resolvedAt → resolved in March via closedAt.
    ticket({ id: 't7', createdAt: new Date('2026-01-20T08:00:00Z'), closedAt: new Date('2026-03-05T08:00:00Z'), priority: 'HIGH' }),
  ],
  slaStates: [
    {
      ticketId: 't2',
      respondedAt: new Date('2026-01-05T12:00:00Z'),
      isResponseBreached: false,
      resolutionCompletedAt: new Date('2026-02-03T10:00:00Z'),
      isResolutionBreached: true,
    },
  ],
  csat: [
    { ticketId: 't2', rating: 5, createdAt: new Date('2026-02-04T08:00:00Z') },
    { ticketId: 't7', rating: 3, createdAt: new Date('2026-03-06T08:00:00Z') },
    { ticketId: 't6', rating: 1, createdAt: new Date('2026-03-06T08:00:00Z') },
  ],
  serviceNames: new Map([
    ['svc-vpn', 'VPN'],
    ['svc-mail', 'E-mail'],
  ]),
};

const configuration: ReportTrendsConfiguration = {
  enabled: true,
  maxMonths: 36,
  cacheSeconds: 600,
  slaTargetPercent: 90,
  csatMinSample: 5,
  csatScaleMax: 5,
  timeZone: zone,
};

function createService(
  overrides: { enabled?: boolean; reportsEnabled?: boolean; csatScaleMax?: number } = {},
) {
  const audit: unknown[] = [];
  const prisma = {
    organizationalUnit: {
      findMany: async () => [
        { id: 'ou-it', ouPath: '/Korisnici/IT' },
        { id: 'ou-it-ops', ouPath: '/Korisnici/IT/Ops' },
        { id: 'ou-hr', ouPath: '/Korisnici/HR' },
      ],
      findUnique: async () => ({ name: 'IT' }),
    },
    $executeRaw: async () => 0,
    auditLog: {
      findFirst: async () => null,
      create: async (args: unknown) => {
        audit.push(args);
        return {};
      },
    },
  };
  const cache = { read: jest.fn(async () => null), write: jest.fn(async () => undefined) };
  const service = new ReportTrendsService(
    prisma as never,
    {
      load: async () => ({
        reportsEnabled: overrides.reportsEnabled ?? true,
        addonEnabled: true,
        enabledPacks: [],
        allowedFormats: ['csv', 'json'],
        bottlenecksEnabled: true,
        defaultWindowDays: 30,
        packWindowDays: 30,
        csatScaleMax: 5,
        pingPongThreshold: 3,
      }),
    } as never,
    {
      load: async () => ({
        ...configuration,
        enabled: overrides.enabled ?? true,
        csatScaleMax: overrides.csatScaleMax ?? configuration.csatScaleMax,
      }),
    } as never,
    cache as never,
    new InMemoryReportTrendSource(() => dataset),
  );
  return { service, cache, audit };
}

describe('ReportTrendsService with the reference source (design §3 definitions)', () => {
  const now = new Date('2026-04-15T10:00:00Z');
  const query = { organizationalUnitId: 'ou-it', from: '2026-01-01', to: '2026-03-31', granularity: 'month' as const };

  it('computes flow, backlog, SLA, durations and CSAT per bucket', async () => {
    const { service } = createService();
    const trends = await service.trends(query, now);
    expect(trends.points.map((point) => [point.key, point.created, point.resolved, point.backlog])).toEqual([
      ['2026-01-01', 2, 1, 2],
      ['2026-02-01', 1, 1, 2],
      ['2026-03-01', 1, 1, 2],
    ]);
    expect(trends.totals).toMatchObject({ created: 4, resolved: 3, net: 1, backlogStart: 1, backlogEnd: 2, resolvedWithoutSla: 2 });
    const [january, february, march] = trends.points;
    expect(january?.slaResponse).toEqual({ total: 1, met: 1, percent: 100 });
    expect(february?.slaResolution).toEqual({ total: 1, met: 0, percent: 0 });
    expect(january?.firstResponse).toMatchObject({ medianHours: 2, sampleCount: 1 });
    expect(february?.resolution.medianHours).toBeCloseTo(29 * 24);
    expect(february?.csat).toMatchObject({ count: 1, average: 5, satisfiedPercent: 100, lowSample: true });
    // The HR rating is outside the unit scope.
    expect(march?.csat).toMatchObject({ count: 1, average: 3, satisfiedPercent: 0, lowSample: true });
  });

  it('takes the CSAT scale and the "satisfied" threshold from the setting (M9/B3, drugi dio)', async () => {
    const { service } = createService({ csatScaleMax: 10 });
    const trends = await service.trends(query, now);
    // Skala 10 -> prag "zadovoljan" je 8 (80%), pa ocjena 5 više nije zadovoljna.
    expect(trends.settings).toMatchObject({ csatScaleMax: 10, csatSatisfiedMinRating: 8 });
    // Ocjena 5 je data u februaru (isti dataset kao prvi test).
    expect(trends.points[1]?.csat).toMatchObject({ count: 1, average: 5, satisfiedPercent: 0 });
    expect(trends.points.every((point) => !point.partial)).toBe(true);
  });

  it('applies the service and priority filters', async () => {
    const { service } = createService();
    const mail = await service.trends({ ...query, serviceId: 'svc-mail' }, now);
    expect(mail.totals.created).toBe(1);
    expect(mail.topServices.items.map((item) => item.name)).toEqual(['E-mail']);
    const high = await service.trends({ ...query, priority: 'HIGH' }, now);
    expect(high.totals).toMatchObject({ created: 1, resolved: 1 });
  });

  it('ranks top services with the previous period', async () => {
    const { service } = createService();
    const trends = await service.trends(query, now);
    expect(trends.topServices.items.map((item) => [item.name, item.current, item.previous])).toEqual([
      ['VPN', 3, 1],
      ['E-mail', 1, 0],
    ]);
  });

  it('caches by scope and filters and reuses the cached value', async () => {
    const { service, cache } = createService();
    await service.trends(query, now);
    expect(cache.write).toHaveBeenCalledTimes(1);
    const [key, , ttl] = cache.write.mock.calls[0] as unknown as [string, unknown, number];
    expect(key.startsWith('reports:trends:')).toBe(true);
    expect(ttl).toBe(600);
    expect(reportTrendsCacheKey({ a: 1, b: 'x' })).toBe(reportTrendsCacheKey({ b: 'x', a: 1 }));
    expect(reportTrendsCacheKey({ unit: 'ou-it' })).not.toBe(reportTrendsCacheKey({ unit: 'ou-hr' }));
  });

  it('stops when trends or reports are disabled', async () => {
    await expect(createService({ enabled: false }).service.trends(query, now)).rejects.toMatchObject({
      code: 'REPORT_TRENDS_DISABLED',
    });
    await expect(createService({ reportsEnabled: false }).service.trends(query, now)).rejects.toMatchObject({
      code: 'REPORTS_DISABLED',
    });
  });

  it('exports one row per bucket and writes the audit entry', async () => {
    const { service, audit } = createService();
    const exported = await service.exportTrends(query, 'csv', 'user-1', 'req-1', now);
    expect(exported.fileName.endsWith('.csv')).toBe(true);
    const lines = exported.content.trim().split(/\r?\n/);
    expect(lines).toHaveLength(4);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0])).toContain('report.trends.exported');
  });

  it('keeps the export rows aligned with the points', async () => {
    const { service } = createService();
    const trends = await service.trends(query, now);
    const rows = toReportTrendExportRows(trends);
    expect(rows).toHaveLength(trends.points.length);
  });
});
