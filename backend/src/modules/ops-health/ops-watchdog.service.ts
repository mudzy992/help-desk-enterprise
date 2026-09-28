import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { withTimeout } from '../health/health-probes';
import { workerHeartbeatRedisKey } from '../integration-queue/integration-queue.constants';
import { observeMonitorFreshness, observeWorkerHeartbeat } from './evaluate-ops-signals';
import { OpsAlertEngine } from './ops-alert.engine';
import { fallbackOpsConfiguration, OpsConfigurationLoader } from './ops-configuration.loader';
import type { OpsSnapshot } from './ops-health.runner';
import { OpsStateStore } from './ops-state.store';

export const watchdogIntervalMs = 60_000;
/** Snapshot older than this (worker alive) means the health loop is stuck. */
export const monitorStaleSeconds = 180;

/**
 * Paket 2.7 (§5.2): a dead worker cannot report itself, so the API checks its
 * heartbeat. Every instance ticks each minute; one wins the Redis lock and
 * evaluates. The same tick checks that the worker's health loop still
 * produces snapshots (`ops.monitor.stale`).
 */
@Injectable()
export class OpsWatchdogService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('OpsWatchdog');
  private readonly store: OpsStateStore;
  private readonly instanceId = randomUUID();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configurationLoader: OpsConfigurationLoader,
    private readonly engine: OpsAlertEngine,
  ) {
    this.store = new OpsStateStore(redis.getClient());
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.OPS_WATCHDOG_DISABLED === 'true') return;
    this.timer = setInterval(() => void this.tick(), watchdogIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now: Date = new Date()): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      // Slightly shorter than the interval so the next tick can take over.
      const leader = await withTimeout(() => this.store.acquireWatchdogLock(this.instanceId, watchdogIntervalMs - 5_000), 1_000).catch(() => false);
      if (!leader) return false;
      const databaseAvailable = await withTimeout(() => this.prisma.$queryRaw`SELECT 1`, 2_000)
        .then(() => true)
        .catch(() => false);
      const configuration = databaseAvailable
        ? await this.configurationLoader.load().catch(() => fallbackOpsConfiguration)
        : fallbackOpsConfiguration;
      const [heartbeat, snapshot] = await Promise.all([
        this.redis.getClient().get(workerHeartbeatRedisKey),
        this.store.readSnapshot<Pick<OpsSnapshot, 'generatedAt'>>(),
      ]);
      const workerObservation = observeWorkerHeartbeat({
        lastHeartbeatAt: heartbeat,
        nowMs: now.getTime(),
        staleSeconds: configuration.thresholds.workerHeartbeatStaleSeconds,
      });
      const monitorObservation = observeMonitorFreshness({
        workerAlive: !workerObservation.active,
        snapshotGeneratedAt: snapshot?.generatedAt ?? null,
        nowMs: now.getTime(),
        staleSeconds: monitorStaleSeconds,
      });
      await this.engine.apply([workerObservation, monitorObservation], {
        configuration,
        now,
        databaseAvailable,
        redisAvailable: true,
      });
      return true;
    } catch (error) {
      this.logger.warn(`ops_watchdog_failed reason=${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
      return false;
    } finally {
      this.running = false;
    }
  }
}
