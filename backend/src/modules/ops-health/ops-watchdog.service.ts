import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { withTimeout } from '../health/health-probes';
import { observeMonitorFreshness, observeWorkerHeartbeat } from './evaluate-ops-signals';
import { OpsAlertEngine } from './ops-alert.engine';
import { fallbackOpsConfiguration, OpsConfigurationLoader } from './ops-configuration.loader';
import { WatchdogRedisProbe } from './watchdog-redis-probe';

export const watchdogIntervalMs = 60_000;
/** Snapshot older than this (worker alive) means the health loop is stuck. */
export const monitorStaleSeconds = 180;
/**
 * Cold-start grace. Right after the API boots the worker may still be starting
 * (image pull, `prisma migrate deploy`, a rolling deploy), so *nothing in Redis
 * yet* is not proof that it is down. A heartbeat that exists and is old is not
 * affected by this: that pages immediately, as before.
 *
 * Incident 2026-10-16: a freshly installed stack paged CRITICAL "Worker ne radi"
 * two minutes after boot, with `heartbeatAgeSeconds: null` — absence, not age.
 */
export const workerAbsenceGraceMs = 5 * 60_000;

/**
 * Paket 2.7 (§5.2): a dead worker cannot report itself, so the API checks its
 * heartbeat. Every instance ticks each minute; one wins the Redis lock and
 * evaluates. The same tick checks that the worker's health loop still
 * produces snapshots (`ops.monitor.stale`).
 */
@Injectable()
export class OpsWatchdogService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('OpsWatchdog');
  private readonly probe: WatchdogRedisProbe;
  private readonly instanceId = randomUUID();
  private readonly startedAtMs = Date.now();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    redis: RedisService,
    private readonly configurationLoader: OpsConfigurationLoader,
    private readonly engine: OpsAlertEngine,
  ) {
    // Prefer duplicate() of the shared client (same ACL/prefix); fall back to a
    // brand-new connection if the mock/test client has no duplicate().
    this.probe = new WatchdogRedisProbe(() => {
      const shared = redis.getClient() as ReturnType<RedisService['getClient']> & {
        duplicate?: () => ReturnType<RedisService['getClient']>;
      };
      if (typeof shared.duplicate === 'function') {
        return { client: shared.duplicate(), ownsConnection: true };
      }
      return { client: shared, ownsConnection: false };
    });
  }

  onApplicationBootstrap(): void {
    // Production only: a local/dev API on a shared DB with a different Redis
    // (Incident 2026-10-17) opened worker.down every minute while Coolify
    // resolved it — false CRITICAL flap. Opt in with OPS_WATCHDOG_ENABLED=true.
    if (!isOpsWatchdogEnabled()) return;
    this.timer = setInterval(() => void this.tick(), watchdogIntervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await this.probe.dispose();
  }

  async tick(now: Date = new Date()): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const store = await withTimeout(() => this.probe.ensureConnected(), 3_000);
      const leader = await withTimeout(
        () => store.acquireWatchdogLock(this.instanceId, watchdogIntervalMs - 5_000),
        1_000,
      ).catch(() => false);
      if (!leader) return false;
      const databaseAvailable = await withTimeout(() => this.prisma.$queryRaw`SELECT 1`, 2_000)
        .then(() => true)
        .catch(() => false);
      const configuration = databaseAvailable
        ? await this.configurationLoader.load().catch(() => fallbackOpsConfiguration)
        : fallbackOpsConfiguration;
      const [heartbeat, snapshot, redisHoldsKeys] = await Promise.all([
        this.probe.readHeartbeat(),
        this.probe.readSnapshot(),
        this.probe.verifyKeyRetention(randomUUID()),
      ]);
      // Absence of a key is proof only when Redis demonstrably keeps what we
      // write and the worker had time to start. Otherwise the watchdog stays
      // quiet and says why — a false CRITICAL costs more than a late one.
      const pastGrace = now.getTime() >= this.startedAtMs + workerAbsenceGraceMs;
      const absenceIsEvidence = redisHoldsKeys && pastGrace;
      if (!redisHoldsKeys) {
        this.logger.error(
          'ops_watchdog_redis_unreliable reason=canary_read_back_missed — absence of the worker heartbeat is not treated as proof',
        );
      }
      if (heartbeat === null) {
        const snapshotAgeSeconds = snapshotAge(snapshot?.generatedAt ?? null, now.getTime());
        this.logger.warn(
          `ops_watchdog_heartbeat_missing redis_holds_keys=${redisHoldsKeys} past_grace=${pastGrace} ` +
            `snapshot_age_s=${snapshotAgeSeconds ?? 'none'} absence_is_evidence=${absenceIsEvidence}`,
        );
      }
      const workerObservation = observeWorkerHeartbeat({
        lastHeartbeatAt: heartbeat,
        nowMs: now.getTime(),
        staleSeconds: configuration.thresholds.workerHeartbeatStaleSeconds,
        snapshotGeneratedAt: snapshot?.generatedAt ?? null,
        snapshotStaleSeconds: monitorStaleSeconds,
        absenceIsEvidence,
      });
      const monitorObservation = observeMonitorFreshness({
        workerAlive: !workerObservation.active,
        snapshotGeneratedAt: snapshot?.generatedAt ?? null,
        nowMs: now.getTime(),
        staleSeconds: monitorStaleSeconds,
        absenceIsEvidence,
      });
      await this.engine.apply([workerObservation, monitorObservation], {
        configuration,
        now,
        databaseAvailable,
        redisAvailable: true,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `ops_watchdog_failed reason=${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`,
      );
      await this.probe.dispose().catch(() => undefined);
      return false;
    } finally {
      this.running = false;
    }
  }
}

/**
 * Watchdog pages into the shared Postgres alarm table. Only the deployed API
 * (`NODE_ENV=production`) should run it; local/dev must opt in explicitly so a
 * laptop Redis without a worker cannot open CRITICAL on a shared database.
 */
export function isOpsWatchdogEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.OPS_WATCHDOG_DISABLED === 'true') return false;
  if (env.OPS_WATCHDOG_ENABLED === 'true') return true;
  return env.NODE_ENV === 'production';
}

function snapshotAge(generatedAt: string | null, nowMs: number): number | null {
  if (generatedAt === null) return null;
  const at = Date.parse(generatedAt);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((nowMs - at) / 1000));
}
