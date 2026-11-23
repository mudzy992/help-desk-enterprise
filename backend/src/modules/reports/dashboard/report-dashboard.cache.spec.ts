jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import {
  floorIsoToCacheGranularity,
  floorToCacheGranularity,
  ReportDashboardCache,
  reportDashboardCacheKey,
} from './report-dashboard.cache';
import type { ReportsDashboard } from './build-reports-dashboard';
import { ReportsService } from '../reports.service';

// W7.105 (BA-reports-15): the cached payload must satisfy the strict validator, so the fixture is a complete
// dashboard — a thin `{} as kpis` is exactly what the old parser let through.
function dashboard(ticketCount: number): ReportsDashboard {
  return {
    timeZone: 'Europe/Sarajevo',
    window: { from: '2026-08-29T07:00:00.000Z', to: '2026-09-28T07:00:00.000Z' },
    previousWindow: { from: '2026-07-30T07:00:00.000Z', to: '2026-08-29T06:59:59.999Z' },
    ticketCount,
    kpis: {
      createdCount: ticketCount,
      createdDeltaPercent: null,
      firstResponseMinutes: 12,
      firstResponseSampleCount: 3,
      firstResponseDeltaMinutes: null,
      resolutionHours: 8,
      resolutionSampleCount: 2,
      resolutionDeltaHours: null,
      csatAverage: null,
      csatCount: 0,
      csatScaleMax: 5,
      kbHelpedCount: 0,
      kbResolutionRate: null,
    },
    bottlenecksEnabled: true,
    bottleneckByGroup: [{ key: 'g1', label: 'Grupa', value: 1 }],
    serviceVolume: [{ key: 's1', label: 'Servis', value: 2 }],
    originUnitVolume: [{ key: 'ou', label: 'Jedinica', value: 3 }],
    assigneeWorkload: [{ key: 'u1', label: 'Agent', value: 4 }],
    volumeSeries: [{ d: '2026-09-01', created: 1, resolved: 0 }],
    aging: {
      lessThanOneDay: 1,
      oneToThreeDays: 2,
      threeToSevenDays: 3,
      moreThanSevenDays: 4,
      waitingOverSevenDays: 5,
    },
  };
}

function fakeRedis() {
  const store = new Map<string, string>();
  const redis = {
    status: 'ready',
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };
  return { redis, store };
}

describe('ReportDashboardCache (paket 2.5)', () => {
  it('floors bounds and „now” to the minute; leaves unparsable input for validation', () => {
    expect(floorToCacheGranularity(new Date('2026-09-28T07:22:21.834Z')).toISOString()).toBe('2026-09-28T07:22:00.000Z');
    expect(floorIsoToCacheGranularity('2026-09-28T07:22:59.999Z')).toBe('2026-09-28T07:22:00.000Z');
    expect(floorIsoToCacheGranularity(undefined)).toBeUndefined();
    expect(floorIsoToCacheGranularity('nope')).toBe('nope');
  });

  it('builds an order-independent, prefixed key', () => {
    const a = reportDashboardCacheKey({ unit: 'ou', from: 'x', to: 'y' });
    const b = reportDashboardCacheKey({ to: 'y', from: 'x', unit: 'ou' });
    expect(a).toBe(b);
    expect(a).toMatch(/^reports:dashboard:[0-9a-f]{32}$/);
    expect(reportDashboardCacheKey({ unit: 'other', from: 'x', to: 'y' })).not.toBe(a);
  });

  it('shares one computation between concurrent misses and serves later hits from Redis', async () => {
    const { redis } = fakeRedis();
    const cache = new ReportDashboardCache(redis as never);
    let release: (value: ReportsDashboard) => void = () => undefined;
    const compute = jest.fn(() => new Promise<ReportsDashboard>((resolve) => (release = resolve)));

    const first = cache.getOrCompute('k', compute);
    const second = cache.getOrCompute('k', compute);
    await new Promise((resolve) => setImmediate(resolve));
    release(dashboard(7));
    await expect(Promise.all([first, second])).resolves.toEqual([dashboard(7), dashboard(7)]);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'k',
      JSON.stringify({ v: 1, data: dashboard(7) }),
      'EX',
      60,
    );

    const third = await cache.getOrCompute('k', compute);
    expect(third.ticketCount).toBe(7);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('treats a broken or foreign payload as a miss and recomputes after a failure', async () => {
    const { redis, store } = fakeRedis();
    store.set('k', '{"not":"a dashboard"}');
    const cache = new ReportDashboardCache(redis as never);
    await expect(cache.getOrCompute('k', async () => dashboard(1))).resolves.toMatchObject({ ticketCount: 1 });

    const failing = jest.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(dashboard(2));
    await expect(cache.getOrCompute('other', failing)).rejects.toThrow('db down');
    await expect(cache.getOrCompute('other', failing)).resolves.toMatchObject({ ticketCount: 2 });
  });

  // W7.105 (BA-reports-15): a value from another build, a legacy value without the envelope and a payload that
  // passes the envelope but not the validator are all misses — and only the ones that can never be valid are deleted.
  it('rejects a payload from another schema version, a legacy value and a shallow payload', async () => {
    const { redis, store } = fakeRedis();
    const cache = new ReportDashboardCache(redis as never);
    store.set('future', JSON.stringify({ v: 2, data: dashboard(9) }));
    store.set('legacy', JSON.stringify(dashboard(9)));
    store.set('shallow', JSON.stringify({ v: 1, data: { ...dashboard(9), aging: {} } }));

    await expect(cache.getOrCompute('future', async () => dashboard(1))).resolves.toMatchObject({ ticketCount: 1 });
    await expect(cache.getOrCompute('legacy', async () => dashboard(1))).resolves.toMatchObject({ ticketCount: 1 });
    await expect(cache.getOrCompute('shallow', async () => dashboard(1))).resolves.toMatchObject({ ticketCount: 1 });
    // None of them was evicted: the future one belongs to the other build, the other two expire with the TTL.
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('keeps working when Redis errors', async () => {
    const redis = {
      status: 'ready',
      get: jest.fn().mockRejectedValue(new Error('x')),
      set: jest.fn().mockRejectedValue(new Error('x')),
      del: jest.fn().mockRejectedValue(new Error('x')),
    };
    const cache = new ReportDashboardCache(redis as never);
    await expect(cache.getOrCompute('k', async () => dashboard(3))).resolves.toMatchObject({ ticketCount: 3 });
  });

  it('is disabled without a Redis client', () => {
    expect(new ReportDashboardCache().enabled).toBe(false);
  });

  it('ReportsService floors the window only when the cache is active and reuses the payload', async () => {
    const { redis } = fakeRedis();
    const cache = new ReportDashboardCache(redis as never);
    const configuration = { reportsEnabled: true, addonEnabled: true, defaultWindowDays: 30, packWindowDays: 30 };
    const service = new ReportsService({} as never, { load: async () => configuration } as never, cache);
    const spy = jest.spyOn(cache, 'getOrCompute').mockImplementation(async () => dashboard(5));

    const now = new Date('2026-09-28T07:22:21.834Z');
    const query = { organizationalUnitId: 'ou', from: '2026-08-29T07:22:21.834Z', to: '2026-09-28T07:22:21.834Z' };
    await service.dashboard(query, now);
    await service.dashboard({ ...query, to: '2026-09-28T07:22:48.001Z' }, new Date('2026-09-28T07:22:50.000Z'));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[0]).toBe(spy.mock.calls[1]?.[0]);

    await service.dashboard(query, new Date('2026-09-28T07:23:00.000Z'));
    expect(spy.mock.calls[2]?.[0]).not.toBe(spy.mock.calls[0]?.[0]);
  });
});
