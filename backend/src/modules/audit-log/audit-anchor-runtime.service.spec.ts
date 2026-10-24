import { AuditAnchorRuntimeService } from './audit-anchor-runtime.service';

describe('AuditAnchorRuntimeService', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original, AUDIT_ANCHOR_ENABLED: 'true', AUDIT_ANCHOR_WORM_URL: 'https://worm.invalid/audit', AUDIT_ANCHOR_HMAC_KEY: 'k'.repeat(32), AUDIT_ANCHOR_KEY_ID: 'key-1', AUDIT_ANCHOR_INTERVAL_MS: '60000', AUDIT_ANCHOR_MAX_LAG_MS: '120000' }; });
  afterEach(() => { process.env = original; jest.restoreAllMocks(); });

  it('fails startup closed when key provider configuration is missing', async () => {
    delete process.env.AUDIT_ANCHOR_HMAC_KEY;
    const service = new AuditAnchorRuntimeService({ findChainHead: jest.fn() } as never);
    await expect(service.onApplicationBootstrap()).rejects.toThrow('AUDIT_ANCHOR_CONFIGURATION_REQUIRED');
    expect(service.status().ready).toBe(false);
  });

  it('publishes periodically with immutable-create semantics and exposes lag metrics', async () => {
    let stored: unknown;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method === 'PUT') { stored = JSON.parse(String(init.body)); return { ok: true, status: 201 } as Response; }
      return { ok: true, status: 200, json: async () => stored } as Response;
    });
    const createdAt = new Date('2026-10-24T12:00:00.000Z');
    const service = new AuditAnchorRuntimeService({ findChainHead: jest.fn().mockResolvedValue({ id: 'head-1', hash: 'a'.repeat(64), createdAt }) } as never);
    await service.publish(createdAt);
    expect(fetchMock).toHaveBeenCalledWith('https://worm.invalid/audit/head-1.json', expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ 'if-none-match': '*' }) }));
    expect(service.status(new Date(createdAt.getTime() + 119_999))).toMatchObject({ ready: true, reason: 'OK', publishLagMs: 119_999, publishFailuresTotal: 0 });
    expect(service.status(new Date(createdAt.getTime() + 120_001))).toMatchObject({ ready: false, reason: 'STALE' });
  });

  it('turns readiness red during sink failure and recovers after a successful publish', async () => {
    let stored: unknown;
    let failed = false;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method === 'PUT' && !failed) { failed = true; return { ok: false, status: 503 } as Response; }
      if (init?.method === 'PUT') { stored = JSON.parse(String(init.body)); return { ok: true, status: 201 } as Response; }
      return { ok: true, status: 200, json: async () => stored } as Response;
    });
    const repository = { findChainHead: jest.fn().mockResolvedValue({ id: 'head-2', hash: 'b'.repeat(64), createdAt: new Date() }) };
    const service = new AuditAnchorRuntimeService(repository as never);
    await expect(service.publish()).rejects.toThrow('AUDIT_ANCHOR_SINK_503');
    expect(service.status()).toMatchObject({ ready: false, reason: 'PUBLISH_FAILED', publishFailuresTotal: 1 });
    await service.publish();
    expect(service.status()).toMatchObject({ ready: true, reason: 'OK', publishFailuresTotal: 1, lastPublishedHeadId: 'head-2' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
