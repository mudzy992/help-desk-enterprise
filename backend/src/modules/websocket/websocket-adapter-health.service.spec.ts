import { WebsocketAdapterHealthService } from './websocket-adapter-health.service';

describe('WebsocketAdapterHealthService', () => {
  it('holds readiness closed until an effective Redis Pub/Sub probe succeeds', () => {
    const health = new WebsocketAdapterHealthService();

    expect(health.isReady()).toBe(false);
    expect(health.getSnapshot()).toEqual({ state: 'starting', reason: 'startup' });

    expect(health.setState('degraded', 'acl_denied')).toBe(true);
    expect(health.isReady()).toBe(false);

    expect(health.setState('healthy', 'probe_ok')).toBe(true);
    expect(health.isReady()).toBe(true);

    expect(health.setState('degraded', 'publish_rejected')).toBe(true);
    expect(health.isReady()).toBe(false);
    expect(health.getSnapshot()).toEqual({
      state: 'degraded',
      reason: 'publish_rejected',
    });
  });

  it('does not report a state transition for a repeated status', () => {
    const health = new WebsocketAdapterHealthService();
    expect(health.setState('degraded', 'connection_error')).toBe(true);
    expect(health.setState('degraded', 'probe_failed')).toBe(false);
    expect(health.getSnapshot().reason).toBe('probe_failed');
  });
});
