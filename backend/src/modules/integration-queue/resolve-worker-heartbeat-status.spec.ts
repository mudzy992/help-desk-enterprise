import { resolveWorkerHeartbeatStatus } from './resolve-worker-heartbeat-status';

describe('resolveWorkerHeartbeatStatus', () => {
  const staleThresholdMilliseconds = 20_000;
  const nowMilliseconds = Date.parse('2026-09-16T12:00:00.000Z');

  it('returns unknown when heartbeat is missing', () => {
    expect(
      resolveWorkerHeartbeatStatus({
        lastHeartbeatAt: null,
        nowMilliseconds,
        staleThresholdMilliseconds,
      }),
    ).toBe('unknown');
  });

  it('returns unknown when heartbeat is not a valid ISO timestamp', () => {
    expect(
      resolveWorkerHeartbeatStatus({
        lastHeartbeatAt: 'not-a-date',
        nowMilliseconds,
        staleThresholdMilliseconds,
      }),
    ).toBe('unknown');
  });

  it('returns active when heartbeat is within the stale threshold', () => {
    expect(
      resolveWorkerHeartbeatStatus({
        lastHeartbeatAt: '2026-09-16T11:59:50.000Z',
        nowMilliseconds,
        staleThresholdMilliseconds,
      }),
    ).toBe('active');
  });

  it('returns stale when heartbeat is older than the stale threshold', () => {
    expect(
      resolveWorkerHeartbeatStatus({
        lastHeartbeatAt: '2026-09-16T11:59:30.000Z',
        nowMilliseconds,
        staleThresholdMilliseconds,
      }),
    ).toBe('stale');
  });
});
