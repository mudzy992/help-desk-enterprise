jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { X509Certificate } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { OpsHealthRunner } from './ops-health.runner';
import { fallbackOpsConfiguration } from './ops-configuration.loader';
import type { OpsSignals } from './evaluate-ops-signals';
import { pingClamav } from './ops-signal-collector';
import { OpsWatchdogService } from './ops-watchdog.service';
import { workerHeartbeatRedisKey } from '../integration-queue/integration-queue.constants';
import { ldapsCaExpiry } from './ops-signal-collector';

const now = new Date('2026-11-20T10:00:00.000Z');

function memoryRedis() {
  const values = new Map<string, string>();
  return {
    values,
    options: { keyPrefix: '' },
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    }),
  };
}

function signals(overrides: Partial<OpsSignals> = {}): OpsSignals {
  return {
    nowMs: now.getTime(),
    database: 'ok',
    redis: 'ok',
    disk: null,
    clamav: { configured: false },
    schedulers: [],
    queues: [{ queue: 'integration', waiting: 0, active: 0, delayed: 0, failed: 4 }],
    integrationDlq: 2,
    http: { errors5xx: 0, total: 10 },
    eventLoopLagMs: null,
    ldapsCaExpiresAtMs: null,
    ...overrides,
  };
}

function setupRunner(collected: OpsSignals) {
  const redis = memoryRedis();
  const prisma = { opsAlert: { deleteMany: jest.fn(async () => ({ count: 3 })) } };
  const collector = { collect: jest.fn(async () => collected), httpSeries: jest.fn(async () => [{ minute: 1, errors5xx: 0, total: 5 }]) };
  const loader = { load: jest.fn(async () => fallbackOpsConfiguration) };
  const engine = { apply: jest.fn(async () => ({ opened: 0, resolved: 0, notified: 0, silenced: false, degraded: 'none' as const })) };
  const push = jest.fn(async () => undefined);
  const runner = new OpsHealthRunner(prisma as never, { getClient: () => redis } as never, collector as never, loader as never, engine as never, push);
  return { redis, prisma, collector, loader, engine, push, runner };
}

describe('OpsHealthRunner', () => {
  afterEach(() => {
    delete process.env.OPS_UPTIME_PUSH_URL;
  });

  it('adopts the current DLQ state as baseline on the first run, then writes the snapshot and pushes', async () => {
    process.env.OPS_UPTIME_PUSH_URL = 'https://kuma.x.ba/api/push/token123';
    const { redis, engine, push, runner, prisma } = setupRunner(signals());
    const snapshot = await runner.run(now);
    expect(JSON.parse(redis.values.get('ops:baseline:dlq')!)).toEqual({ integrationDlq: 2, failedByQueue: { integration: 4 } });
    const observations = (engine.apply.mock.calls[0] as unknown as [Array<{ key: string; active: boolean }>])[0];
    expect(observations.find((observation) => observation.key === 'queue.dlq')!.active).toBe(false);
    expect(JSON.parse(redis.values.get('ops:snapshot')!).generatedAt).toBe(now.toISOString());
    expect(snapshot.httpSeries).toHaveLength(1);
    expect(push).toHaveBeenCalledWith('https://kuma.x.ba/api/push/token123');
    expect(prisma.opsAlert.deleteMany).toHaveBeenCalledTimes(1);
    await runner.run(new Date(now.getTime() + 60_000));
    // History is pruned at most hourly.
    expect(prisma.opsAlert.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('works without the database: fallback configuration, no purge, still pushes', async () => {
    process.env.OPS_UPTIME_PUSH_URL = 'https://kuma.x.ba/api/push/t';
    const { loader, engine, prisma, push, runner } = setupRunner(signals({ database: 'fail', integrationDlq: null }));
    await runner.run(now);
    expect(loader.load).not.toHaveBeenCalled();
    expect((engine.apply.mock.calls[0] as unknown as [unknown, { databaseAvailable: boolean }])[1].databaseAvailable).toBe(false);
    expect(prisma.opsAlert.deleteMany).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalled();
  });

  it('survives an engine failure and a failing push', async () => {
    process.env.OPS_UPTIME_PUSH_URL = 'https://kuma.x.ba/api/push/t';
    const { engine, push, runner } = setupRunner(signals());
    engine.apply.mockRejectedValueOnce(new Error('boom'));
    push.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    await expect(runner.run(now)).resolves.toMatchObject({ engine: { degraded: 'database' } });
  });
});

describe('OpsWatchdogService', () => {
  function setupWatchdog(heartbeatAgeSeconds: number | null, snapshotAgeSeconds: number | null) {
    const redis = memoryRedis();
    if (heartbeatAgeSeconds !== null) redis.values.set(workerHeartbeatRedisKey, new Date(now.getTime() - heartbeatAgeSeconds * 1000).toISOString());
    if (snapshotAgeSeconds !== null) redis.values.set('ops:snapshot', JSON.stringify({ generatedAt: new Date(now.getTime() - snapshotAgeSeconds * 1000).toISOString() }));
    const prisma = { $queryRaw: jest.fn(async () => [1]) };
    const engine = { apply: jest.fn(async () => ({})) };
    const loader = { load: jest.fn(async () => fallbackOpsConfiguration) };
    return { redis, engine, watchdog: new OpsWatchdogService(prisma as never, { getClient: () => redis } as never, loader as never, engine as never) };
  }

  it('reports a dead worker and does not blame the monitor for it', async () => {
    const { engine, watchdog } = setupWatchdog(600, 600);
    await watchdog.tick(now);
    const [observations] = engine.apply.mock.calls[0] as unknown as [Array<{ key: string; active: boolean }>];
    expect(observations.map((observation) => observation.active)).toEqual([true, false]);
  });

  it('evaluates heartbeat and monitor freshness once per lock period', async () => {
    const { engine, watchdog, redis } = setupWatchdog(10, 400);
    expect(await watchdog.tick(now)).toBe(true);
    const [observations] = engine.apply.mock.calls[0] as unknown as [Array<{ key: string; active: boolean }>];
    expect(observations.map((observation) => [observation.key, observation.active])).toEqual([
      ['worker.down', false],
      ['ops.monitor.stale', true],
    ]);
    // Second instance in the same minute loses the lock.
    const second = new OpsWatchdogService({ $queryRaw: async () => [1] } as never, { getClient: () => redis } as never, { load: async () => fallbackOpsConfiguration } as never, engine as never);
    expect(await second.tick(now)).toBe(false);
  });
});

describe('pingClamav', () => {
  let server: Server;
  let port: number;
  let reply: string | null;

  beforeAll(async () => {
    server = createServer((socket) => {
      socket.on('data', (data) => {
        if (reply !== null && data.toString() === 'zPING\0') socket.end(reply);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('is true on PONG and false on silence or refusal', async () => {
    reply = 'PONG\0';
    expect(await pingClamav('127.0.0.1', port, 1_000)).toBe(true);
    reply = null;
    expect(await pingClamav('127.0.0.1', port, 200)).toBe(false);
    expect(await pingClamav('127.0.0.1', 1, 500)).toBe(false);
  });
});

describe('ldapsCaExpiry', () => {
  const pem = `-----BEGIN CERTIFICATE-----
MIIDBTCCAe2gAwIBAgIUYLFvFY7BUs8KeogPmF6zXT8VtAUwDQYJKoZIhvcNAQEL
BQAwEjEQMA4GA1UEAwwHdGVzdC1jYTAeFw0yNjA5MjgxODU5MzlaFw0yNzExMDIx
ODU5MzlaMBIxEDAOBgNVBAMMB3Rlc3QtY2EwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQC25FNgq9EKo6rcDnR1ylyib6o1Ng+LMrb+CH4m2Tpdji2b5Vlg
1GEhZreKx9uVSEeSUbi4HxxEHVsLHn4g8kf3L8yTIgfBKMwRQvcNR1nyyLz2hw0w
urBmPS5sLc04AyW6z2Mh93O5B3QqtTAaSxJVVb64rTKnwQN7dVfIVLJmcZBPKjoY
3VJFpxOgMAjatCjq7u2xdfBUkzfjmSPIZVxfvUIlWYRR22/bsiZ0ZnYzjfxZPneo
OB7Y+MqwJPiifbL6q/zkNCg+8iSKH4chBCpwvKsba6msAcoJrtfmMV7/AIct+mUf
L75FHylD1D9GQs2N0seTQxdEePYQgcrneR7XAgMBAAGjUzBRMB0GA1UdDgQWBBR5
g4sws2UnfEkZiGl87wGp27MH8DAfBgNVHSMEGDAWgBR5g4sws2UnfEkZiGl87wGp
27MH8DAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCKXX5Qy+fe
MGfYnmiL3KgY32imRjAmrvUYzQI883ZtMHjY4Sm8L60r2l65kh4WcvdJD+JKH2Nj
jgHMGvY38II2plwbk/oYMjRQ8wBJGxHzOTEgus3n75ZAJxXzzu3cKNxT8MyNqY0N
D1WiFMqaJhSFH6HteWE13fxRObkTz4y/vm5vRxQwiVEqhud5BW04Wnd37DFTqm36
bjZGLAl+n9bYYpCaCfn09Bg980owlToewS9m2OjrKQEYRzqtzgwsjw1gg85xgd01
7hnN//UdivX8zb0RyYvlwf7fW5CwlJyH1EZhWQu1LmQmUmqaDINN1JcxnOEMDhhP
u1Ds0iDn2v/p
-----END CERTIFICATE-----`;

  it('reads the earliest expiry of the configured bundle', () => {
    const expected = Date.parse(new X509Certificate(pem).validTo);
    expect(ldapsCaExpiry({ AD_LDAPS_CA_CERT_BASE64: Buffer.from(`${pem}\n${pem}`).toString('base64') })).toBe(expected);
  });

  it('is null when nothing (or nothing readable) is configured', () => {
    expect(ldapsCaExpiry({})).toBeNull();
    expect(ldapsCaExpiry({ AD_LDAPS_CA_CERT_BASE64: Buffer.from('not a pem').toString('base64') })).toBeNull();
  });
});
