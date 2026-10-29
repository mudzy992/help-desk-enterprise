import type Redis from 'ioredis';
import { opsRedisKeys } from './ops-state.store';
import { fallbackOpsConfiguration } from './ops-configuration.loader';
import {
  OpsWatchdogService,
  isOpsWatchdogEnabled,
  monitorStaleSeconds,
  watchdogIntervalMs,
  workerAbsenceGraceMs,
} from './ops-watchdog.service';
import type { OpsObservation } from './evaluate-ops-signals';
import { opsAlertKeys } from './ops-alert-catalog';
import { workerHeartbeatRedisKey } from '../integration-queue/integration-queue.constants';

/*
  Incident 2026-10-16: a freshly installed stack paged CRITICAL „Worker ne radi"
  with `heartbeatAgeSeconds: null` — the watchdog had read *no* key and treated
  absence as death. These tests pin the contract that replaced it:

    * a heartbeat that exists decides by its age (both directions);
    * a missing key needs corroboration (no fresh snapshot) AND a Redis that
      demonstrably keeps what we write (the canary) AND the cold-start grace;
    * a healthy worker is never paged because a key could not be read.
*/

type FakeRedisOptions = {
  /** Keys matching this are "evicted": SET succeeds, GET returns null. */
  readonly evict?: RegExp;
};

function fakeRedis(values: Record<string, string> = {}, options: FakeRedisOptions = {}) {
  const store = new Map<string, string>(Object.entries(values));
  const calls: string[] = [];
  const client = {
    status: 'ready',
    options: { keyPrefix: '' },
    on: () => client,
    connect: async () => undefined,
    quit: async () => 'OK',
    disconnect: () => undefined,
    async get(key: string) {
      calls.push(`GET ${key}`);
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, ...args: unknown[]) {
      calls.push(`SET ${key}`);
      if (args.includes('NX') && store.has(key)) return null;
      if (options.evict?.test(key) === true) return 'OK';
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      calls.push(`DEL ${key}`);
      return store.delete(key) ? 1 : 0;
    },
    async hmget(_key: string, ...fields: string[]) {
      calls.push(`HMGET ${_key}`);
      return fields.map(() => null);
    },
    async hset(..._args: unknown[]) {
      calls.push('HSET');
      return 1;
    },
  };
  return { client, store, calls };
}

type EngineCall = {
  readonly observations: readonly OpsObservation[];
  readonly context: { readonly databaseAvailable: boolean; readonly redisAvailable: boolean };
};

function harness(options: {
  readonly redis?: ReturnType<typeof fakeRedis>;
  readonly databaseAvailable?: boolean;
} = {}) {
  const redis = options.redis ?? fakeRedis();
  const shared = {
    status: 'ready',
    options: { keyPrefix: '' },
    duplicate: () => redis.client as unknown as Redis,
  };
  const engineCalls: EngineCall[] = [];
  const prisma = {
    $queryRaw: async () => {
      if (options.databaseAvailable === false) throw new Error('database down');
      return [{ '?column?': 1 }];
    },
  };
  const configurationLoader = { load: async () => fallbackOpsConfiguration };
  const engine = {
    apply: async (observations: readonly OpsObservation[], context: EngineCall['context']) => {
      engineCalls.push({ observations, context });
      return { opened: 0, resolved: 0, notified: 0, silenced: false, degraded: 'none' as const };
    },
  };
  const service = new OpsWatchdogService(
    prisma as never,
    { getClient: () => shared } as never,
    configurationLoader as never,
    engine as never,
  );
  const byKey = (key: string) =>
    engineCalls.flatMap((call) => call.observations).find((observation) => observation.key === key);
  return { service, engineCalls, byKey, redis };
}

/** A moment the watchdog is certainly past its cold-start grace. */
const afterGrace = () => new Date(Date.now() + workerAbsenceGraceMs + watchdogIntervalMs);
/** An ISO timestamp `seconds` before `at` — the clock the tick runs on. */
const secondsBefore = (at: Date, seconds: number) => new Date(at.getTime() - seconds * 1_000).toISOString();

describe('OpsWatchdogService (worker liveness)', () => {
  it('does not page during the cold start of a fresh install', async () => {
    // Nothing in Redis yet: no heartbeat, no snapshot — the worker is still booting.
    const { service, byKey } = harness();
    await expect(service.tick(new Date())).resolves.toBe(true);
    expect(byKey(opsAlertKeys.workerDown)?.active).toBe(false);
    expect(byKey(opsAlertKeys.opsMonitorStale)?.active).toBe(false);
  });

  it('does not page when the heartbeat key is missing but the worker writes snapshots', async () => {
    const now = afterGrace();
    const redis = fakeRedis({
      [opsRedisKeys.snapshot]: JSON.stringify({ generatedAt: secondsBefore(now, 10) }),
    });
    const { service, byKey } = harness({ redis });
    await service.tick(now);
    expect(byKey(opsAlertKeys.workerDown)?.active).toBe(false);
    expect(byKey(opsAlertKeys.opsMonitorStale)?.active).toBe(false);
  });

  it('pages when neither the heartbeat nor a snapshot can be found', async () => {
    const { service, byKey } = harness();
    await service.tick(afterGrace());
    expect(byKey(opsAlertKeys.workerDown)).toMatchObject({
      active: true,
      severity: 'CRITICAL',
      details: { heartbeatMissing: true, snapshotAgeSeconds: null },
    });
    // The monitor alarm stays quiet: it is the same absence, not a second fact.
    expect(byKey(opsAlertKeys.opsMonitorStale)?.active).toBe(false);
  });

  it('stays quiet when Redis drops the keys we just wrote (eviction, wrong prefix)', async () => {
    const redis = fakeRedis({}, { evict: /^ops:watchdog:canary$/ });
    const { service, byKey } = harness({ redis });
    await service.tick(afterGrace());
    expect(byKey(opsAlertKeys.workerDown)?.active).toBe(false);
    expect(byKey(opsAlertKeys.opsMonitorStale)?.active).toBe(false);
  });

  it('pages on a heartbeat that exists and is old — also during the grace', async () => {
    const now = new Date();
    const redis = fakeRedis({
      [workerHeartbeatRedisKey]: secondsBefore(now, monitorStaleSeconds + 600),
    });
    const { service, byKey } = harness({ redis });
    await service.tick(now);
    const observation = byKey(opsAlertKeys.workerDown);
    expect(observation?.active).toBe(true);
    expect(observation?.details.heartbeatAgeSeconds).toBeGreaterThanOrEqual(120);
    expect(observation?.details.heartbeatMissing).toBeUndefined();
  });

  it('reads a fresh heartbeat as alive and reports a stuck health loop', async () => {
    const now = afterGrace();
    const redis = fakeRedis({ [workerHeartbeatRedisKey]: secondsBefore(now, 5) });
    const { service, byKey } = harness({ redis });
    await service.tick(now);
    expect(byKey(opsAlertKeys.workerDown)?.active).toBe(false);
    expect(byKey(opsAlertKeys.opsMonitorStale)).toMatchObject({
      active: true,
      severity: 'WARNING',
      details: { snapshotMissing: true },
    });
  });

  it('evaluates only while it holds the watchdog lock', async () => {
    const redis = fakeRedis({ [opsRedisKeys.watchdogLock]: 'another-instance' });
    const { service, engineCalls } = harness({ redis });
    await expect(service.tick(afterGrace())).resolves.toBe(false);
    expect(engineCalls).toHaveLength(0);
  });

  it('survives a Redis that refuses the connection and evaluates nothing', async () => {
    const broken = {
      status: 'wait',
      options: { keyPrefix: '' },
      on: () => broken,
      connect: async () => {
        throw new Error('WRONGPASS');
      },
      quit: async () => 'OK',
      disconnect: () => undefined,
    };
    const { service, engineCalls } = harness({
      redis: { client: broken, store: new Map(), calls: [] } as never,
    });
    await expect(service.tick(afterGrace())).resolves.toBe(false);
    expect(engineCalls).toHaveLength(0);
  });

  it('reports an unavailable database without stopping the check', async () => {
    const { service, engineCalls, byKey } = harness({ databaseAvailable: false });
    await service.tick(afterGrace());
    expect(engineCalls[0]?.context.databaseAvailable).toBe(false);
    expect(byKey(opsAlertKeys.workerDown)?.active).toBe(true);
  });

  it('does not start the timer while the watchdog is disabled', async () => {
    const previous = process.env.OPS_WATCHDOG_DISABLED;
    process.env.OPS_WATCHDOG_DISABLED = 'true';
    try {
      const { service } = harness();
      service.onApplicationBootstrap();
      await service.onModuleDestroy();
    } finally {
      if (previous === undefined) delete process.env.OPS_WATCHDOG_DISABLED;
      else process.env.OPS_WATCHDOG_DISABLED = previous;
    }
  });
});

describe('isOpsWatchdogEnabled', () => {
  it('runs in production, stays off in development unless explicitly enabled', () => {
    expect(isOpsWatchdogEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(isOpsWatchdogEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isOpsWatchdogEnabled({ NODE_ENV: 'development', OPS_WATCHDOG_ENABLED: 'true' })).toBe(true);
    expect(isOpsWatchdogEnabled({ NODE_ENV: 'production', OPS_WATCHDOG_DISABLED: 'true' })).toBe(false);
  });
});
