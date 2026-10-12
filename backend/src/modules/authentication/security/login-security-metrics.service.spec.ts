import {
  LoginSecurityMetricsService,
  metricsBucketKey,
  minuteBucketOf,
} from './login-security-metrics.service';

/*
  Paket 5.4.0-b (M2): the counters carry no PII — only the event name and the
  minute bucket — and the last-hour aggregation totals every bucket. The
  memory store path is exercised here; the Redis path shares the bucket logic
  and is covered on the server.
*/

function service() {
  return new LoginSecurityMetricsService(undefined);
}

describe('LoginSecurityMetricsService', () => {
  it('aggregates the last hour per event with one point per minute', async () => {
    const metrics = service();
    const now = new Date('2026-10-09T12:00:30Z');
    await metrics.record('login-429', now);
    await metrics.record('login-429', now);
    await metrics.record('login-429', new Date('2026-10-09T11:30:00Z'));
    await metrics.record('mfa-failures', now);
    const snapshot = await metrics.lastHour(now);
    expect(snapshot.windowSeconds).toBe(3600);
    expect(snapshot.metrics['login-429'].total).toBe(3);
    expect(snapshot.metrics['login-429'].peakPerMinute).toBe(2);
    expect(snapshot.metrics['mfa-failures'].total).toBe(1);
    expect(snapshot.metrics['login-account-delays'].total).toBe(0);
    expect(snapshot.metrics['login-429'].points).toHaveLength(60);
    expect(snapshot.metrics['login-429'].points[59]).toEqual({
      at: '2026-10-09T12:00:00.000Z',
      count: 2,
    });
  });

  it('keeps the buckets inside the window only (no PII in the keys)', async () => {
    const metrics = service();
    const now = new Date('2026-10-09T12:00:00Z');
    await metrics.record('login-429', new Date('2026-10-09T10:59:59Z'));
    await metrics.record('login-429', new Date('2026-10-09T11:01:00Z'));
    const snapshot = await metrics.lastHour(now);
    // 10:59 is outside the 60-minute window ending 12:00; 11:01 is the first bucket.
    expect(snapshot.metrics['login-429'].total).toBe(1);
    expect(snapshot.metrics['login-429'].points[0]).toEqual({ at: '2026-10-09T11:01:00.000Z', count: 1 });
    expect(metricsBucketKey('login-429', minuteBucketOf(now))).toMatch(/^security:metrics:login-429:\d+$/);
  });
});

describe('LoginSecurityMetricsService best-effort writes (5.4.0-b/f)', () => {
  it('never turns a metrics outage into a sign-in error', async () => {
    const redis = {
      eval: jest.fn(async () => {
        throw new Error('redis down');
      }),
    };
    const metrics = new LoginSecurityMetricsService(redis as never);
    await expect(metrics.record('login-429')).resolves.toBeUndefined();
    expect(redis.eval).toHaveBeenCalledTimes(1);
  });

  it('writes the minute bucket with the 2 h TTL, so the window cannot grow forever', async () => {
    const redis = { eval: jest.fn(async () => 1), mget: jest.fn(async () => []) };
    const metrics = new LoginSecurityMetricsService(redis as never);
    const at = new Date('2026-10-12T09:15:30Z');
    await metrics.record('hibp-skipped', at);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1,
      metricsBucketKey('hibp-skipped', minuteBucketOf(at)),
      String(2 * 60 * 60),
    );
  });

  it('reports every known event, even when nothing happened in the window', async () => {
    const metrics = service();
    const snapshot = await metrics.lastHour(new Date('2026-10-12T09:15:00Z'));
    expect(Object.keys(snapshot.metrics).sort()).toEqual([
      'hibp-skipped',
      'login-429',
      'login-account-delays',
      'mfa-failures',
    ]);
    for (const series of Object.values(snapshot.metrics)) {
      expect(series.total).toBe(0);
      expect(series.points).toHaveLength(60);
    }
  });
});
