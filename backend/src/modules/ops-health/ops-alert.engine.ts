import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { decideAlertTransition, type AlertNotificationKind, type AlertStreak, type OpenAlertState } from './alert-state-machine';
import type { OpsObservation } from './evaluate-ops-signals';
import { opsAlertCatalog, type OpsAlertKey, type OpsAlertSeverity } from './ops-alert-catalog';
import { OpsAlertNotifier, type OpsChannelResult } from './ops-alert-notifier.service';
import type { OpsAlertMessage } from './ops-alert-presentation';
import type { OpsConfiguration } from './ops-configuration.loader';
import { OpsFallbackNotifier } from './ops-fallback-notifier';
import { OpsStateStore } from './ops-state.store';

export const OPS_FALLBACK_NOTIFIER = Symbol('OPS_FALLBACK_NOTIFIER');

type OpenRow = {
  readonly id: string;
  readonly key: string;
  readonly severity: string;
  readonly status: string;
  readonly firstSeenAt: Date;
  readonly lastNotifiedAt: Date | null;
  readonly notifyCount: number;
};

export type OpsEngineSummary = {
  readonly opened: number;
  readonly resolved: number;
  readonly notified: number;
  readonly silenced: boolean;
  readonly degraded: 'none' | 'redis' | 'database';
};

const openRowSelect = {
  id: true,
  key: true,
  severity: true,
  status: true,
  firstSeenAt: true,
  lastNotifiedAt: true,
  notifyCount: true,
} as const;

/**
 * Paket 2.7 (§5): applies one round of observations - hysteresis streaks
 * (Redis), the alarm rows (Postgres, one open row per key) and notifications
 * (regular channels, or the env fallback when the database is down).
 *
 * Used by the worker health loop and by the API watchdog (heartbeat only).
 * Two instances may evaluate the same key in the same minute: the partial
 * unique index makes the second "open" a no-op, and every notification has a
 * per-event dedupe key.
 */
@Injectable()
export class OpsAlertEngine {
  private readonly logger = new Logger(OpsAlertEngine.name);
  private readonly store: OpsStateStore;
  /** Streaks while Redis is down, and alarms announced only via the fallback. */
  private readonly memoryStreaks = new Map<string, AlertStreak>();
  private readonly fallbackOpen = new Map<OpsAlertKey, { severity: OpsAlertSeverity; firstSeenAt: Date }>();

  constructor(
    private readonly prisma: PrismaService,
    redis: RedisService,
    private readonly notifier: OpsAlertNotifier,
    @Optional() @Inject(OPS_FALLBACK_NOTIFIER) private readonly fallback: OpsFallbackNotifier = new OpsFallbackNotifier(),
  ) {
    this.store = new OpsStateStore(redis.getClient());
  }

  async apply(
    observations: readonly OpsObservation[],
    context: {
      readonly configuration: OpsConfiguration;
      readonly now: Date;
      readonly databaseAvailable: boolean;
      readonly redisAvailable: boolean;
    },
  ): Promise<OpsEngineSummary> {
    const { now } = context;
    const keys = observations.map((observation) => observation.key);
    const streaks = await this.readStreaks(keys, context.redisAvailable);
    const silence = context.redisAvailable ? await this.store.readSilence(now).catch(() => null) : null;
    const mayNotify = context.configuration.alertsEnabled && silence === null;

    if (!context.databaseAvailable) {
      const nextStreaks = new Map<string, AlertStreak>();
      let notified = 0;
      for (const observation of observations) {
        const decision = this.decideWithoutDatabase(observation, streaks.get(observation.key)!, now);
        nextStreaks.set(observation.key, decision.streak);
        if (decision.message !== null && mayNotify) {
          const channels = await this.fallback.notify(decision.message);
          if (channels.length > 0) notified += 1;
          else if (!this.fallback.isConfigured()) this.logger.error(`ops_alert_undeliverable key=${observation.key} reason=database_down_no_fallback`);
        }
      }
      await this.writeStreaks(nextStreaks, context.redisAvailable);
      return { opened: 0, resolved: 0, notified, silenced: silence !== null, degraded: 'database' };
    }

    const openRows = await this.prisma.opsAlert.findMany({
      where: { key: { in: keys }, status: { in: ['FIRING', 'ACKNOWLEDGED'] } },
      select: openRowSelect,
    });
    const openByKey = new Map(openRows.map((row) => [row.key, row as OpenRow]));
    const nextStreaks = new Map<string, AlertStreak>();
    let opened = 0;
    let resolved = 0;
    let notified = 0;

    for (const observation of observations) {
      const recovered = await this.recordFallbackHistory(observation, openByKey.get(observation.key) ?? null, now);
      if (recovered.resolved !== null && mayNotify) {
        const results = await this.notifier.notify({
          message: recovered.resolved,
          configuration: context.configuration,
          dedupeKey: `ops-alert-fallback:${observation.key}:${recovered.resolved.firstSeenAt.getTime()}:resolved`,
          alertId: null,
          now,
        });
        if (results.some((result) => result.delivered > 0)) notified += 1;
      }
      const current = recovered.adopted ?? openByKey.get(observation.key) ?? null;
      const decision = decideAlertTransition({
        observation,
        open: current === null ? null : toOpenState(current),
        streak: streaks.get(observation.key)!,
        now,
        reminderMs: context.configuration.reminderHours * 3_600_000,
      });
      nextStreaks.set(observation.key, decision.streak);
      let row: OpenRow | null = current;
      try {
        switch (decision.action) {
          case 'none':
            break;
          case 'open':
            row = await this.open(observation, now);
            if (row !== null && row.notifyCount === 0) opened += 1;
            break;
          case 'touch':
          case 'escalate':
          case 'deescalate':
            await this.prisma.opsAlert.update({
              where: { id: current!.id },
              data: { lastSeenAt: now, severity: observation.severity, details: observation.details as object },
            });
            row = { ...current!, severity: observation.severity };
            break;
          case 'resolve':
            await this.prisma.opsAlert.updateMany({
              where: { id: current!.id, status: { in: ['FIRING', 'ACKNOWLEDGED'] } },
              data: { status: 'RESOLVED', resolvedAt: now },
            });
            resolved += 1;
            break;
        }
      } catch (error) {
        this.logger.warn(`ops_alert_persist_failed key=${observation.key} reason=${errorText(error)}`);
        continue;
      }
      if (decision.notify === null || row === null || !mayNotify) continue;
      const delivered = await this.announce(row, observation, decision.notify, context.configuration, now);
      if (delivered) notified += 1;
    }
    await this.writeStreaks(nextStreaks, context.redisAvailable);
    return { opened, resolved, notified, silenced: silence !== null, degraded: context.redisAvailable ? 'none' : 'redis' };
  }

  /** "Send test alarm" (§5.4): every channel, result per channel. */
  async sendTest(configuration: OpsConfiguration, actorUserId: string, now: Date = new Date()): Promise<OpsChannelResult[]> {
    const message: OpsAlertMessage = {
      key: 'ops.test',
      severity: 'WARNING',
      kind: 'test',
      details: {},
      firstSeenAt: now,
      resolvedAt: null,
    };
    return this.notifier.notify({
      message,
      configuration,
      dedupeKey: `ops-test:${actorUserId}:${now.getTime()}`,
      alertId: null,
      now,
    });
  }

  private async open(observation: OpsObservation, now: Date): Promise<OpenRow | null> {
    try {
      return (await this.prisma.opsAlert.create({
        data: {
          key: observation.key,
          severity: observation.severity,
          status: 'FIRING',
          details: observation.details as object,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        select: openRowSelect,
      })) as OpenRow;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another instance opened it in the same minute; it also notifies.
      return null;
    }
  }

  private async announce(
    row: OpenRow,
    observation: OpsObservation,
    kind: AlertNotificationKind,
    configuration: OpsConfiguration,
    now: Date,
  ): Promise<boolean> {
    const sequence = row.notifyCount + 1;
    // Claim the event first: a second instance with the same view of the row loses.
    const claimed = await this.prisma.opsAlert.updateMany({
      where: { id: row.id, notifyCount: row.notifyCount },
      data: { notifyCount: sequence, lastNotifiedAt: now },
    });
    if (claimed.count === 0) return false;
    const message: OpsAlertMessage = {
      key: observation.key,
      severity: observation.active ? observation.severity : (row.severity as OpsAlertSeverity),
      kind,
      details: observation.active ? observation.details : {},
      firstSeenAt: row.firstSeenAt,
      resolvedAt: kind === 'resolved' ? now : null,
    };
    const results = await this.notifier.notify({
      message,
      configuration,
      dedupeKey: `ops-alert:${row.id}:${kind}:${sequence}`,
      alertId: row.id,
      now,
    });
    const delivered = results.some((result) => result.delivered > 0);
    if (!delivered) {
      // Nothing reached anyone: release the claim so the next round retries
      // (as "opened" while notifyCount is 0), and try the env channel now.
      await this.prisma.opsAlert
        .updateMany({ where: { id: row.id, notifyCount: sequence }, data: { notifyCount: row.notifyCount, lastNotifiedAt: row.lastNotifiedAt } })
        .catch(() => undefined);
      const channels = await this.fallback.notify(message);
      if (channels.length > 0) {
        await this.prisma.opsAlert
          .updateMany({ where: { id: row.id, notifyCount: row.notifyCount }, data: { notifyCount: sequence, lastNotifiedAt: now } })
          .catch(() => undefined);
        return true;
      }
      this.logger.warn(`ops_alert_undelivered key=${observation.key} kind=${kind}`);
    }
    return delivered;
  }

  /**
   * Database down: nothing can be stored. Streaks still count (Redis or
   * memory) and an alarm that crosses its threshold goes to the env channel
   * once; its end is announced the same way and written to history later.
   */
  private decideWithoutDatabase(
    observation: OpsObservation,
    streak: AlertStreak,
    now: Date,
  ): { streak: AlertStreak; message: OpsAlertMessage | null } {
    const known = this.fallbackOpen.get(observation.key);
    const decision = decideAlertTransition({
      observation,
      open: known === undefined ? null : { status: 'FIRING', severity: known.severity, lastNotifiedAt: now, notifyCount: 1 },
      streak,
      now,
      reminderMs: Number.MAX_SAFE_INTEGER,
    });
    if (decision.action === 'open') {
      this.fallbackOpen.set(observation.key, { severity: observation.severity, firstSeenAt: now });
      return { streak: decision.streak, message: fallbackMessage(observation, 'opened', now, null) };
    }
    if (decision.action === 'escalate' && known !== undefined) {
      this.fallbackOpen.set(observation.key, { ...known, severity: observation.severity });
      return { streak: decision.streak, message: fallbackMessage(observation, 'escalated', known.firstSeenAt, null) };
    }
    if (decision.action === 'resolve' && known !== undefined) {
      this.fallbackOpen.delete(observation.key);
      this.pendingHistory.set(observation.key, { severity: known.severity, firstSeenAt: known.firstSeenAt, resolvedAt: now });
      return {
        streak: decision.streak,
        message: { key: observation.key, severity: known.severity, kind: 'resolved', details: {}, firstSeenAt: known.firstSeenAt, resolvedAt: now },
      };
    }
    return { streak: decision.streak, message: null };
  }

  private readonly pendingHistory = new Map<OpsAlertKey, { severity: OpsAlertSeverity; firstSeenAt: Date; resolvedAt: Date }>();

  /**
   * The database is back. Alarms announced only through the fallback become
   * rows: resolved ones as history, still active ones as an open row that
   * already counts one notification (so "opened" is not sent twice).
   */
  private async recordFallbackHistory(
    observation: OpsObservation,
    current: OpenRow | null,
    now: Date,
  ): Promise<{ adopted: OpenRow | null; resolved: OpsAlertMessage | null }> {
    const none = { adopted: null, resolved: null };
    const open = this.fallbackOpen.get(observation.key);
    const pending = this.pendingHistory.get(observation.key);
    if (pending === undefined && open === undefined) return none;
    try {
      if (pending === undefined && observation.active) {
        this.fallbackOpen.delete(observation.key);
        if (current !== null) return none;
        const adopted = (await this.prisma.opsAlert.create({
          data: {
            key: observation.key,
            severity: observation.severity,
            status: 'FIRING',
            details: observation.details as object,
            firstSeenAt: open!.firstSeenAt,
            lastSeenAt: now,
            lastNotifiedAt: open!.firstSeenAt,
            notifyCount: 1,
          },
          select: openRowSelect,
        })) as OpenRow;
        return { adopted, resolved: null };
      }
      const entry = pending ?? { severity: open!.severity, firstSeenAt: open!.firstSeenAt, resolvedAt: now };
      await this.prisma.opsAlert.create({
        data: {
          key: observation.key,
          severity: entry.severity,
          status: 'RESOLVED',
          details: { deliveredVia: 'fallback' },
          firstSeenAt: entry.firstSeenAt,
          lastSeenAt: entry.resolvedAt,
          resolvedAt: entry.resolvedAt,
          lastNotifiedAt: entry.firstSeenAt,
          notifyCount: 1,
        },
      });
      this.pendingHistory.delete(observation.key);
      this.fallbackOpen.delete(observation.key);
      // Ended while nobody could announce it (typically the database alarm
      // itself): the regular channels carry the "resolved" message.
      return pending !== undefined
        ? none
        : {
            adopted: null,
            resolved: { key: observation.key, severity: entry.severity, kind: 'resolved', details: {}, firstSeenAt: entry.firstSeenAt, resolvedAt: now },
          };
    } catch (error) {
      this.logger.warn(`ops_alert_history_failed key=${observation.key} reason=${errorText(error)}`);
    }
    return none;
  }

  private async readStreaks(keys: readonly string[], redisAvailable: boolean): Promise<Map<string, AlertStreak>> {
    if (redisAvailable) {
      try {
        const stored = await this.store.readStreaks(keys);
        for (const [key, streak] of stored) this.memoryStreaks.set(key, streak);
        return stored;
      } catch (error) {
        this.logger.warn(`ops_streak_read_failed reason=${errorText(error)}`);
      }
    }
    return new Map(keys.map((key) => [key, this.memoryStreaks.get(key) ?? { positive: 0, negative: 0 }]));
  }

  private async writeStreaks(streaks: ReadonlyMap<string, AlertStreak>, redisAvailable: boolean): Promise<void> {
    for (const [key, streak] of streaks) this.memoryStreaks.set(key, streak);
    if (!redisAvailable) return;
    await this.store.writeStreaks(streaks).catch((error: unknown) => this.logger.warn(`ops_streak_write_failed reason=${errorText(error)}`));
  }
}

function toOpenState(row: OpenRow): OpenAlertState {
  return {
    status: row.status === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : 'FIRING',
    severity: row.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
    lastNotifiedAt: row.lastNotifiedAt,
    notifyCount: row.notifyCount,
  };
}

function fallbackMessage(observation: OpsObservation, kind: AlertNotificationKind, firstSeenAt: Date, resolvedAt: Date | null): OpsAlertMessage {
  return { key: observation.key, severity: observation.severity, kind, details: observation.details, firstSeenAt, resolvedAt };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

/** Keys the catalog knows; used by the controller to validate input. */
export const knownOpsAlertKeys = Object.keys(opsAlertCatalog) as OpsAlertKey[];
