import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { emailDeliveryStatuses } from '../notifications/email/email-template.constants';
import { countStuckNotificationEmailDeliveries } from '../notifications/email/persist-notification-email-delivery';
import { workerHeartbeatRedisKey } from '../integration-queue/integration-queue.constants';
import { evaluateWorkerHeartbeat, withTimeout } from '../health/health-probes';
import type { PrivacyActor } from '../privacy/privacy-actor';
import type { OpsChannelResult } from './ops-alert-notifier.service';
import { opsAlertCatalog, isOpsAlertKey } from './ops-alert-catalog';
import { OpsAlertEngine } from './ops-alert.engine';
import { OpsConfigurationLoader } from './ops-configuration.loader';
import type { OpsSnapshot } from './ops-health.runner';
import { isFallbackConfigured, readFallbackConfiguration } from './ops-fallback-notifier';
import { OpsStateStore, type OpsSilence } from './ops-state.store';
import { schedulerGraceMs } from './evaluate-ops-signals';
import { SettingsService } from '../settings/settings.service';
import { inboundMailboxKey, loadInboundEmailConfiguration } from '../inbound-email/inbound-email-configuration';

export type OpsAlertView = {
  readonly id: string;
  readonly key: string;
  readonly severity: string;
  readonly status: string;
  readonly details: unknown;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly resolvedAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly acknowledgedBy: string | null;
  readonly notifyCount: number;
  readonly runbook: string | null;
};

const alertSelect = {
  id: true,
  key: true,
  severity: true,
  status: true,
  details: true,
  firstSeenAt: true,
  lastSeenAt: true,
  resolvedAt: true,
  acknowledgedAt: true,
  acknowledgedByUserId: true,
  notifyCount: true,
} as const;

type AlertRow = {
  id: string;
  key: string;
  severity: string;
  status: string;
  details: unknown;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  notifyCount: number;
};

/**
 * Paket 2.7 (§6): read model of the "System health" card and the operator
 * actions on alarms. The heavy measuring happens in the worker; this reads
 * its snapshot plus a few live probes of its own (API, database, Redis,
 * worker heartbeat), so the card also works while the worker is down.
 */
@Injectable()
export class OpsHealthService {
  private readonly logger = new Logger(OpsHealthService.name);
  private readonly store: OpsStateStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configurationLoader: OpsConfigurationLoader,
    private readonly engine: OpsAlertEngine,
    private readonly settings: SettingsService,
  ) {
    this.store = new OpsStateStore(redis.getClient());
  }

  async overview(now: Date = new Date()) {
    const [database, redisState, heartbeat, snapshot, silence, configuration, alerts, emailLast, stuckEmailClaims, inbound] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`, 2_000),
      probe(() => this.redis.getClient().ping(), 1_000),
      withTimeout(() => this.redis.getClient().get(workerHeartbeatRedisKey), 1_000).catch(() => null),
      this.store.readSnapshot<OpsSnapshot>().catch(() => null),
      this.store.readSilence(now).catch(() => null),
      this.configurationLoader.load(),
      this.prisma.opsAlert.findMany({
        where: { status: { in: ['FIRING', 'ACKNOWLEDGED'] } },
        select: alertSelect,
        orderBy: [{ severity: 'asc' }, { firstSeenAt: 'asc' }],
      }),
      this.prisma.notificationEmailDelivery
        .findFirst({ where: { status: emailDeliveryStatuses.sent }, orderBy: { createdAt: 'desc' }, select: { updatedAt: true } })
        .catch(() => null),
      // Val 3 (M12/B1): rows stuck in CLAIMED (a process died between claim and
      // send). They are reclaimed automatically after 10 minutes; this counter is
      // what makes the state visible instead of silently "healthy".
      countStuckNotificationEmailDeliveries(this.prisma, now).catch(() => null),
      this.currentInboundState(),
    ]);
    const worker = evaluateWorkerHeartbeat({
      lastHeartbeatAt: heartbeat,
      nowMs: now.getTime(),
      staleSeconds: configuration.thresholds.workerHeartbeatStaleSeconds,
    });
    const signals = snapshot?.signals ?? null;
    const lateIds = new Set((snapshot?.lateJobs ?? []).map((job) => `${job.queue}/${job.schedulerId}`));
    const users = await this.userNames(alerts.map((alert) => alert.acknowledgedByUserId));
    return {
      generatedAt: now.toISOString(),
      snapshot: snapshot === null ? null : { generatedAt: snapshot.generatedAt, ageSeconds: ageSeconds(snapshot.generatedAt, now) },
      components: {
        api: 'ok' as const,
        database,
        redis: redisState,
        // The card speaks the integration-queue vocabulary (active/stale/unknown).
        worker: {
          status: worker.heartbeatAgeSeconds === null ? ('unknown' as const) : worker.status === 'ok' ? ('active' as const) : ('stale' as const),
          heartbeatAgeSeconds: worker.heartbeatAgeSeconds,
        },
        clamav: signals === null ? null : signals.clamav,
        disk: signals?.disk ?? null,
        eventLoopLagMs: signals?.eventLoopLagMs ?? null,
        ldapsCaExpiresAt: signals?.ldapsCaExpiresAtMs == null ? null : new Date(signals.ldapsCaExpiresAtMs).toISOString(),
        email: {
          lastSentAt: emailLast?.updatedAt.toISOString() ?? null,
          stuckClaims: stuckEmailClaims,
        },
        inbound,
      },
      schedulers: (signals?.schedulers ?? []).map((scheduler) => ({
        queue: scheduler.queue,
        schedulerId: scheduler.schedulerId,
        everyMs: scheduler.everyMs,
        pattern: scheduler.pattern,
        nextAt: scheduler.nextMs === null ? null : new Date(scheduler.nextMs).toISOString(),
        lastSuccessAt: scheduler.lastSuccessMs === null ? null : new Date(scheduler.lastSuccessMs).toISOString(),
        lastFailureAt: scheduler.lastFailureMs === null ? null : new Date(scheduler.lastFailureMs).toISOString(),
        graceMs: schedulerGraceMs(scheduler),
        state: lateIds.has(`${scheduler.queue}/${scheduler.schedulerId}`) ? ('late' as const) : ('on_time' as const),
      })),
      queues: signals?.queues ?? [],
      dlq: {
        integrationDlq: signals?.integrationDlq ?? null,
        growth: snapshot?.dlqGrowth ?? null,
      },
      http: {
        series: (snapshot?.httpSeries ?? []).map((entry) => ({ at: new Date(entry.minute * 60_000).toISOString(), errors5xx: entry.errors5xx, total: entry.total })),
      },
      alerts: alerts.map((alert) => toView(alert as AlertRow, users)),
      silence: silence === null ? null : await this.silenceView(silence),
      configuration: {
        alertsEnabled: configuration.alertsEnabled,
        reminderHours: configuration.reminderHours,
        historyDays: configuration.historyDays,
        thresholds: configuration.thresholds,
        extraRecipientCount: configuration.extraRecipients.length,
        teamsConfigured: configuration.teamsWebhookUrl !== null,
        fallbackConfigured: isFallbackConfigured(readFallbackConfiguration()),
        uptimePushConfigured: /^https?:\/\//i.test(process.env.OPS_UPTIME_PUSH_URL?.trim() ?? ''),
      },
    };
  }

  async history(status: 'open' | 'resolved' | 'all' = 'resolved', limit = 100): Promise<OpsAlertView[]> {
    const where =
      status === 'all' ? {} : status === 'open' ? { status: { in: ['FIRING', 'ACKNOWLEDGED'] } } : { status: 'RESOLVED' };
    const rows = await this.prisma.opsAlert.findMany({
      where,
      select: alertSelect,
      orderBy: { firstSeenAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    const users = await this.userNames(rows.map((row) => row.acknowledgedByUserId));
    return rows.map((row) => toView(row as AlertRow, users));
  }

  /** "Preuzeto": stops reminders; escalation and resolution still notify. */
  async acknowledge(id: string, actor: PrivacyActor, now: Date = new Date()): Promise<OpsAlertView> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.opsAlert.updateMany({
        where: { id, status: 'FIRING' },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: now, acknowledgedByUserId: actor.principal.subjectId },
      });
      const row = await transaction.opsAlert.findUnique({ where: { id }, select: alertSelect });
      if (row === null) throw new NotFoundException({ code: 'OPS_ALERT_NOT_FOUND', message: 'Alarm not found' });
      if (updated.count > 0) {
        await recordAuditEntry(transaction as never, {
          action: auditLogActions.opsAlertAcknowledged,
          entityType: auditLogEntityTypes.opsAlert,
          entityId: id,
          metadata: { key: row.key, severity: row.severity },
          actorUserId: actor.principal.subjectId,
          requestId: actor.requestId,
          organizationalUnitId: null,
        });
      }
      const users = await this.userNames([row.acknowledgedByUserId]);
      return toView(row as AlertRow, users);
    });
  }

  async silence(minutes: number, reason: string, actor: PrivacyActor, now: Date = new Date()) {
    const silence: OpsSilence = {
      until: new Date(now.getTime() + minutes * 60_000).toISOString(),
      reason: reason.slice(0, 300),
      byUserId: actor.principal.subjectId,
    };
    await this.store.writeSilence(silence, now);
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.opsAlertsSilenced,
      entityType: auditLogEntityTypes.opsMonitoring,
      entityId: 'alerts',
      metadata: { minutes, until: silence.until, reason: silence.reason },
      actorUserId: actor.principal.subjectId,
      requestId: actor.requestId,
      organizationalUnitId: null,
    });
    return this.silenceView(silence);
  }

  async unsilence(actor: PrivacyActor): Promise<{ readonly cleared: boolean }> {
    const cleared = await this.store.clearSilence();
    if (cleared) {
      await recordAuditEntry(this.prisma, {
        action: auditLogActions.opsAlertsUnsilenced,
        entityType: auditLogEntityTypes.opsMonitoring,
        entityId: 'alerts',
        metadata: {},
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
        organizationalUnitId: null,
      });
    }
    return { cleared };
  }

  async sendTest(actor: PrivacyActor): Promise<{ readonly channels: OpsChannelResult[] }> {
    const configuration = await this.configurationLoader.load();
    const channels = await this.engine.sendTest(configuration, actor.principal.subjectId);
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.opsAlertTestSent,
      entityType: auditLogEntityTypes.opsMonitoring,
      entityId: 'alerts',
      metadata: { channels: channels.map((channel) => ({ channel: channel.channel, status: channel.status, delivered: channel.delivered })) },
      actorUserId: actor.principal.subjectId,
      requestId: actor.requestId,
      organizationalUnitId: null,
    });
    return { channels };
  }

  /**
   * "Pregledano" (§4.2): the current failed counts become the baseline, so
   * only new failures alarm. Uses the latest worker snapshot; without one
   * there is nothing reliable to acknowledge.
   */
  async acknowledgeDlq(actor: PrivacyActor): Promise<{ readonly integrationDlq: number; readonly failedByQueue: Record<string, number> }> {
    const snapshot = await this.store.readSnapshot<OpsSnapshot>();
    const queues = snapshot?.signals.queues;
    if (snapshot === null || queues == null) {
      throw new NotFoundException({ code: 'OPS_SNAPSHOT_UNAVAILABLE', message: 'No recent health snapshot; is the worker running?' });
    }
    const integrationDlq = await this.prisma.integrationJob.count({ where: { status: 'DLQ' } });
    const baseline = { integrationDlq, failedByQueue: Object.fromEntries(queues.map((queue) => [queue.queue, queue.failed])) };
    await this.store.writeDlqBaseline(baseline);
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.opsDlqBaselineAcknowledged,
      entityType: auditLogEntityTypes.opsMonitoring,
      entityId: 'dlq',
      metadata: baseline,
      actorUserId: actor.principal.subjectId,
      requestId: actor.requestId,
      organizationalUnitId: null,
    });
    this.logger.log(`ops_dlq_baseline_acknowledged integration=${integrationDlq}`);
    return baseline;
  }

  private async silenceView(silence: OpsSilence) {
    const users = await this.userNames([silence.byUserId]);
    return { until: silence.until, reason: silence.reason, by: users.get(silence.byUserId) ?? null };
  }

  /**
   * Only the mailbox that is configured now, and only while inbound e-mail is
   * enabled - rows of a replaced or disabled mailbox stay in the table (2.3)
   * but must not colour the card. Same rule as the inbound status panel.
   */
  private async currentInboundState(): Promise<
    Array<{ mailboxKey: string; lastRunAt: string | null; lastSuccessAt: string | null; lastError: string | null; lastErrorAt: string | null; consecutiveFails: number }>
  > {
    try {
      const configuration = await loadInboundEmailConfiguration(this.settings);
      if (!configuration.enabled) return [];
      const mailboxKey = inboundMailboxKey(configuration);
      const state = await this.prisma.inboundMailboxState.findUnique({ where: { mailboxKey } });
      return [
        {
          mailboxKey,
          lastRunAt: state?.lastRunAt?.toISOString() ?? null,
          lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
          lastError: state?.lastError ?? null,
          lastErrorAt: state?.lastErrorAt?.toISOString() ?? null,
          consecutiveFails: state?.consecutiveFails ?? 0,
        },
      ];
    } catch (error) {
      this.logger.warn(`ops_inbound_state_failed reason=${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private async userNames(ids: ReadonlyArray<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}

function toView(row: AlertRow, users: ReadonlyMap<string, string>): OpsAlertView {
  return {
    id: row.id,
    key: row.key,
    severity: row.severity,
    status: row.status,
    details: row.details,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: row.acknowledgedByUserId === null ? null : (users.get(row.acknowledgedByUserId) ?? null),
    notifyCount: row.notifyCount,
    runbook: isOpsAlertKey(row.key) ? opsAlertCatalog[row.key].runbook : null,
  };
}

function ageSeconds(iso: string, now: Date): number | null {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((now.getTime() - at) / 1000));
}

async function probe(work: () => Promise<unknown>, timeoutMs: number): Promise<'ok' | 'fail'> {
  try {
    await withTimeout(work, timeoutMs);
    return 'ok';
  } catch {
    return 'fail';
  }
}
