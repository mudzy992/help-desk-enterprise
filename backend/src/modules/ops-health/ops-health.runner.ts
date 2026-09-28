import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { withTimeout } from '../health/health-probes';
import {
  dlqGrowth,
  evaluateOpsSignals,
  findLateSchedulers,
  lowerDlqBaseline,
  type OpsSignals,
} from './evaluate-ops-signals';
import { OpsAlertEngine, type OpsEngineSummary } from './ops-alert.engine';
import { fallbackOpsConfiguration, OpsConfigurationLoader, type OpsConfiguration } from './ops-configuration.loader';
import { opsProbeTimeouts } from './ops-health.constants';
import { OpsSignalCollector } from './ops-signal-collector';
import { OpsStateStore } from './ops-state.store';

export const OPS_UPTIME_PUSH = Symbol('OPS_UPTIME_PUSH');
export type UptimePush = (url: string) => Promise<void>;

/** What the dashboard reads (§6); written by the worker every round, TTL 5 min. */
export type OpsSnapshot = {
  readonly generatedAt: string;
  readonly signals: OpsSignals;
  readonly lateJobs: ReturnType<typeof findLateSchedulers>;
  readonly dlqGrowth: ReturnType<typeof dlqGrowth>;
  readonly httpSeries: Array<{ minute: number; errors5xx: number; total: number }>;
  readonly engine: OpsEngineSummary;
};

const purgeEveryMs = 3_600_000;

const pushWithFetch: UptimePush = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opsProbeTimeouts.uptimePushMs);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Paket 2.7 (§4, §5.2): one health round in the worker - collect, evaluate,
 * apply alarms, publish the snapshot, push the dead man's switch and prune
 * old history. Nothing in here throws out of `run`; the round always ends
 * with a snapshot (possibly partial) so the dashboard shows what is known.
 */
@Injectable()
export class OpsHealthRunner {
  private readonly logger = new Logger('OpsHealth');
  private readonly store: OpsStateStore;
  private lastPurgeAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    redis: RedisService,
    private readonly collector: OpsSignalCollector,
    private readonly configurationLoader: OpsConfigurationLoader,
    private readonly engine: OpsAlertEngine,
    @Optional() @Inject(OPS_UPTIME_PUSH) private readonly uptimePush: UptimePush = pushWithFetch,
  ) {
    this.store = new OpsStateStore(redis.getClient());
  }

  async run(now: Date = new Date()): Promise<OpsSnapshot> {
    const signals = await this.collector.collect(now);
    const databaseAvailable = signals.database === 'ok';
    const redisAvailable = signals.redis === 'ok';
    const configuration = await this.loadConfiguration(databaseAvailable);
    const baseline = redisAvailable ? await this.baseline(signals) : null;
    const observations = evaluateOpsSignals(signals, configuration.thresholds, baseline);
    const engine = await this.engine
      .apply(observations, { configuration, now, databaseAvailable, redisAvailable })
      .catch((error: unknown): OpsEngineSummary => {
        this.logger.error(`ops_engine_failed reason=${errorText(error)}`);
        return { opened: 0, resolved: 0, notified: 0, silenced: false, degraded: 'database' };
      });
    const snapshot: OpsSnapshot = {
      generatedAt: now.toISOString(),
      signals,
      lateJobs: findLateSchedulers(signals),
      dlqGrowth: dlqGrowth(signals, baseline),
      httpSeries: redisAvailable ? await this.collector.httpSeries(now.getTime()).catch(() => []) : [],
      engine,
    };
    if (redisAvailable) {
      await this.store.writeSnapshot(snapshot).catch((error: unknown) => this.logger.warn(`ops_snapshot_write_failed reason=${errorText(error)}`));
    }
    if (databaseAvailable) await this.purgeHistory(configuration, now);
    await this.push();
    const active = observations.filter((observation) => observation.active).map((observation) => observation.key);
    this.logger.log(
      `ops_health db=${signals.database} redis=${signals.redis} active=${active.length === 0 ? '-' : active.join(',')} opened=${engine.opened} resolved=${engine.resolved} notified=${engine.notified}${engine.silenced ? ' silenced=1' : ''}`,
    );
    return snapshot;
  }

  private async loadConfiguration(databaseAvailable: boolean): Promise<OpsConfiguration> {
    if (!databaseAvailable) return fallbackOpsConfiguration;
    try {
      return await withTimeout(() => this.configurationLoader.load(), opsProbeTimeouts.databaseMs * 2);
    } catch (error) {
      this.logger.warn(`ops_configuration_failed reason=${errorText(error)}`);
      return fallbackOpsConfiguration;
    }
  }

  /**
   * First run: the current state becomes the baseline, so an upgrade does not
   * alarm about failures that happened long ago. Afterwards it only follows
   * trimmed counts down; moving it up is the operator's "Reviewed" action.
   */
  private async baseline(signals: OpsSignals) {
    try {
      const stored = await this.store.readDlqBaseline();
      if (stored === null) {
        if (signals.queues === null || signals.integrationDlq === null) return null;
        const initial = {
          integrationDlq: signals.integrationDlq,
          failedByQueue: Object.fromEntries(signals.queues.map((queue) => [queue.queue, queue.failed])),
        };
        await this.store.writeDlqBaseline(initial);
        return initial;
      }
      const lowered = lowerDlqBaseline(signals, stored);
      if (lowered !== null) await this.store.writeDlqBaseline(lowered);
      return lowered ?? stored;
    } catch (error) {
      this.logger.warn(`ops_baseline_failed reason=${errorText(error)}`);
      return null;
    }
  }

  private async purgeHistory(configuration: OpsConfiguration, now: Date): Promise<void> {
    if (now.getTime() - this.lastPurgeAt < purgeEveryMs) return;
    this.lastPurgeAt = now.getTime();
    try {
      const cutoff = new Date(now.getTime() - configuration.historyDays * 86_400_000);
      const removed = await this.prisma.opsAlert.deleteMany({ where: { status: 'RESOLVED', resolvedAt: { lt: cutoff } } });
      if (removed.count > 0) this.logger.log(`ops_alert_history_purged count=${removed.count}`);
    } catch (error) {
      this.logger.warn(`ops_alert_history_purge_failed reason=${errorText(error)}`);
    }
  }

  private async push(): Promise<void> {
    const url = process.env.OPS_UPTIME_PUSH_URL?.trim() ?? '';
    if (!/^https?:\/\//i.test(url)) return;
    try {
      await this.uptimePush(url);
    } catch (error) {
      // The URL carries the monitor token: log the host only.
      this.logger.warn(`ops_uptime_push_failed host=${safeHost(url)} reason=${errorText(error)}`);
    }
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '-';
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
