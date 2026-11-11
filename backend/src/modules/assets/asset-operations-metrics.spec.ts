import {
  AssetOperationsMetricStore,
  assetOperationsMetricEvents,
  assetOperationsMetricKey,
  assetOperationsMetricTtlSeconds,
} from './asset-operations-metrics';

describe('AssetOperationsMetricStore', () => {
  const now = new Date(61 * 60_000 + 45_000);

  it('increments a fixed minute bucket with a bounded retention TTL', async () => {
    const redis = { eval: jest.fn(async () => 1), mget: jest.fn(async () => []) };
    const metrics = new AssetOperationsMetricStore(redis as never);

    await metrics.increment(assetOperationsMetricEvents.auditWriteFailure, now);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      1,
      assetOperationsMetricKey('audit_write_failure', 61),
      assetOperationsMetricTtlSeconds,
    );
    expect(assetOperationsMetricTtlSeconds).toBe(70 * 60);
    expect(assetOperationsMetricKey('directory_sync_overlap', 61)).not.toContain('user');
  });

  it('sums only the previous 60 complete minutes for each event', async () => {
    const values = new Map<string, string>();
    const redis = {
      eval: jest.fn(async () => 1),
      mget: jest.fn(async (...keys: string[]) => keys.map((key) => values.get(key) ?? null)),
    };
    values.set(assetOperationsMetricKey('directory_sync_overlap', 1), '2');
    values.set(assetOperationsMetricKey('directory_sync_overlap', 60), '3');
    values.set(assetOperationsMetricKey('directory_sync_overlap', 61), '100'); // current minute is excluded
    values.set(assetOperationsMetricKey('audit_write_failure', 59), '4');
    const metrics = new AssetOperationsMetricStore(redis as never);

    await expect(metrics.readLastHour(now)).resolves.toEqual({
      directorySyncOverlapsLastHour: 5,
      auditWriteFailuresLastHour: 4,
    });
    expect(redis.mget).toHaveBeenCalledTimes(1);
    const keys = redis.mget.mock.calls[0] as unknown as string[];
    expect(keys).toHaveLength(120);
    expect(keys[0]).toBe(assetOperationsMetricKey('directory_sync_overlap', 1));
    expect(keys[59]).toBe(assetOperationsMetricKey('directory_sync_overlap', 60));
    expect(keys[60]).toBe(assetOperationsMetricKey('audit_write_failure', 1));
    expect(keys[119]).toBe(assetOperationsMetricKey('audit_write_failure', 60));
  });

  it('fails closed on malformed Redis counter values so the caller can report unknown', async () => {
    const redis = {
      eval: jest.fn(async () => 1),
      mget: jest.fn(async (...keys: string[]) => keys.map((key) => key.endsWith(':1') ? '-1' : null)),
    };
    const metrics = new AssetOperationsMetricStore(redis as never);

    await expect(metrics.readLastHour(now)).rejects.toThrow('invalid asset operations metric count');
  });
});
