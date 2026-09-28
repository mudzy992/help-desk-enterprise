jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import {
  floorIsoToCacheGranularity,
  floorToCacheGranularity,
  ReportDashboardCache,
  reportDashboardCacheKey,
} from './report-dashboard.cache';
import type { ReportsDashboard } from './build-reports-dashboard';
import { ReportsService } from '../reports.service';

function dashboard(ticketCount: number): ReportsDashboard {
  return {
    window: { from: '2026-08-29T07:00:00.000Z', to: '2026-09-28T07:00:00.000Z' },
    previousWindow: { from: '2026-07-30T07:00:00.000Z', to: '2026-08-29T06:59:59.999Z' },
    ticketCount,
    kpis: {} as ReportsDashboard['kpis'],
    bottleneckByGroup: [],
    serviceVolume: [],
    volumeSeries: [],
    aging: {} as ReportsDashboard['aging'],
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
    expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify(dashboard(7)), 'EX', 60);

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

  it('keeps working when Redis errors', async () => {
    const redis = { status: 'ready', get: jest.fn().mockRejectedValue(new Error('x')), set: jest.fn().mockRejectedValue(new Error('x')) };
    const cache = new ReportDashboardCache(redis as never);
    await expect(cache.getOrCompute('k', async () => dashboard(3))).resolves.toMatchObject({ ticketCount: 3 });
  });

  it('is disabled without a Redis client', () => {
    expect(new ReportDashboardCache().enabled).toBe(false);
  });

  it('ReportsService floors the window only when the cache is active and reuses the payload', async () => {
    const { redis } = fakeRedis();
    const cache = new ReportDashboardCache(redis as never);
    const configuration = { reportsEnabled: true, addonEnabled: true, defaultWindowDays: 30 };
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
