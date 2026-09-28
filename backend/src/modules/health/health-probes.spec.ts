import { CachedProbe, evaluateWorkerHeartbeat, probeReadiness, withTimeout } from './health-probes';

describe('health probes (2.7 §3)', () => {
  it('readiness is ok only when database and Redis both answer', async () => {
    const ok = () => Promise.resolve(1);
    const down = () => Promise.reject(new Error('ECONNREFUSED 10.0.0.1:5432'));
    await expect(probeReadiness({ pingDatabase: ok, pingRedis: ok })).resolves.toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    });
    const failed = await probeReadiness({ pingDatabase: down, pingRedis: ok });
    expect(failed).toEqual({ status: 'fail', checks: { database: 'fail', redis: 'ok' } });
    // Nothing from the error (hosts, messages) leaks into the public result.
    expect(JSON.stringify(failed)).not.toContain('10.0.0.1');
  });

  it('a hanging dependency fails by timeout instead of hanging the probe', async () => {
    jest.useFakeTimers();
    try {
      const pending = probeReadiness({ pingDatabase: () => new Promise(() => undefined), pingRedis: () => Promise.resolve('PONG') });
      await jest.advanceTimersByTimeAsync(2_100);
      await expect(pending).resolves.toMatchObject({ status: 'fail', checks: { database: 'fail', redis: 'ok' } });
    } finally {
      jest.useRealTimers();
    }
  });

  it('withTimeout returns the value when it arrives in time', async () => {
    await expect(withTimeout(() => Promise.resolve(7), 50)).resolves.toBe(7);
  });

  it('worker heartbeat: fresh → ok, stale or missing → fail', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    expect(evaluateWorkerHeartbeat({ lastHeartbeatAt: '2026-09-28T11:59:50Z', nowMs: now, staleSeconds: 120 })).toEqual({
      status: 'ok',
      heartbeatAgeSeconds: 10,
    });
    expect(evaluateWorkerHeartbeat({ lastHeartbeatAt: '2026-09-28T11:57:00Z', nowMs: now, staleSeconds: 120 }).status).toBe('fail');
    expect(evaluateWorkerHeartbeat({ lastHeartbeatAt: null, nowMs: now, staleSeconds: 120 })).toEqual({ status: 'fail', heartbeatAgeSeconds: null });
    expect(evaluateWorkerHeartbeat({ lastHeartbeatAt: 'garbage', nowMs: now, staleSeconds: 120 }).status).toBe('fail');
  });

  it('CachedProbe runs once per TTL window', async () => {
    let clock = 0;
    const run = jest.fn(async () => clock);
    const cached = new CachedProbe(run, 5_000, () => clock);
    await cached.get();
    clock = 4_999;
    await cached.get();
    expect(run).toHaveBeenCalledTimes(1);
    clock = 5_000;
    await expect(cached.get()).resolves.toBe(5_000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
