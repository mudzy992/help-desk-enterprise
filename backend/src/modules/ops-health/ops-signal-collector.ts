import { X509Certificate } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { Socket } from 'node:net';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createBullMqRootConfiguration } from '../../common/redis/create-bullmq-root-configuration';
import { loadRedisConfiguration } from '../../common/redis/load-redis-configuration';
import { RedisService } from '../../common/redis/redis.service';
import { readCaCertificate } from '../directory-sync/ldaps/ldap-directory-client';
import { withTimeout } from '../health/health-probes';
import { readClamavConfiguration } from '../tickets/attachments/scan-attachment-with-clamav';
import { resolveUploadRoot } from '../tickets/attachments/resolve-upload-root';
import { websocketEmitRoomKinds } from '../websocket/websocket-emit-counter';
import { securityAuditWebhookStateId } from '../security-audit-webhook/security-audit-webhook.constants';
import { login429WindowMinutes, type OpsSignals, type QueueSignal, type SchedulerSignal } from './evaluate-ops-signals';
import type { LoginSecurityMetricEvent } from '../authentication/security/login-security-metrics.service';
import {
  expectedAssetSchedulers,
  opsMonitoredQueueNames,
  opsProbeTimeouts,
} from './ops-health.constants';
import { OpsStateStore } from './ops-state.store';
import { collectSlaObservability } from '../sla/collect-sla-observability';
import { slaScanQueueName, slaScanSchedulerId } from '../sla/sla-scan.constants';

/**
 * Paket 2.7 (§4): gathers one round of signals in the worker. Every probe has
 * its own timeout and failure mode - one broken dependency yields "fail" or
 * null for that signal and never aborts the round.
 */
@Injectable()
export class OpsSignalCollector implements OnModuleDestroy {
  private readonly logger = new Logger(OpsSignalCollector.name);
  private readonly store: OpsStateStore;
  /** BullMQ refuses ioredis clients with a key prefix, so inspection gets its own connection. */
  private connection: IORedis | null = null;
  private queues: Queue[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.store = new OpsStateStore(redis.getClient());
  }

  async collect(now: Date = new Date()): Promise<OpsSignals> {
    const nowMs = now.getTime();
    const [database, redis] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`, opsProbeTimeouts.databaseMs),
      probe(() => this.redis.getClient().ping(), opsProbeTimeouts.redisMs),
    ]);
    const [disk, clamav, bull, integrationDlq, http, eventLoopLagMs, websocketEmits, login429LastHour] = await Promise.all([
      this.disk(),
      this.clamav(),
      redis === 'ok' ? this.inspectQueues() : Promise.resolve(null),
      database === 'ok'
        ? withTimeout(() => this.prisma.integrationJob.count({ where: { status: 'DLQ' } }), opsProbeTimeouts.databaseMs).catch(() => null)
        : Promise.resolve(null),
      redis === 'ok' ? this.http(nowMs) : Promise.resolve(null),
      redis === 'ok' ? this.store.readEventLoopLagMs().catch(() => null) : Promise.resolve(null),
      redis === 'ok' ? this.websocket(nowMs) : Promise.resolve(null),
      redis === 'ok' ? this.login429(nowMs) : Promise.resolve(null),
    ]);
    // Paket 5.4.2 (stavka 2): kept out of the tuple above, so each total keeps its own type.
    const [captchaFailedLastHour, captchaSkippedLastHour] = await Promise.all([
      redis === 'ok' ? this.securityMetric(nowMs, 'captcha-failed') : Promise.resolve(null),
      redis === 'ok' ? this.securityMetric(nowMs, 'captcha-skipped') : Promise.resolve(null),
    ]);
    // Paket 5.4.2 (stavka 4): read apart from the tuples above, for the same reason.
    const auditWebhookPendingSinceMs = database === 'ok' ? await this.auditWebhookPendingSince() : null;
    // Incident 2026-10-16: outbound mail paused by the provider (daily quota).
    const mailProviderBlock = redis === 'ok' ? await this.mailProviderBlock() : null;
    const sla = database === 'ok'
      ? await withTimeout(
          () => collectSlaObservability(this.prisma, {
            now,
            schedulerRegistered: bull === null
              ? null
              : bull.schedulers.some((scheduler) => scheduler.queue === slaScanQueueName && scheduler.schedulerId === slaScanSchedulerId),
          }),
          opsProbeTimeouts.databaseMs,
        ).catch(() => null)
      : null;
    return {
      nowMs,
      database,
      redis,
      disk,
      clamav,
      schedulers: bull?.schedulers ?? null,
      queues: bull?.queues ?? null,
      integrationDlq,
      http,
      eventLoopLagMs,
      ldapsCaExpiresAtMs: ldapsCaExpiry(),
      websocketEmits,
      login429LastHour,
      captchaFailedLastHour,
      captchaSkippedLastHour,
      auditWebhookPendingSinceMs,
      mailProviderBlock,
      sla,
    };
  }

  /**
   * State of `MailProviderLimitBreaker`, written by whichever process hit the
   * provider limit (API or worker) and read here by the health round. `null`
   * both when mail flows and when Redis cannot be read — an unknown value never
   * opens the alarm (`redis.unavailable` covers that case).
   */
  private async mailProviderBlock(): Promise<OpsSignals['mailProviderBlock']> {
    try {
      const block = await withTimeout(
        () => this.store.readMailProviderBlock(),
        opsProbeTimeouts.redisMs,
      );
      if (block === null) return null;
      return {
        reason: block.reason,
        openedAtMs: block.openedAtMs,
        blockedUntilMs: block.blockedUntilMs,
        suppressedTotal: block.suppressedTotal,
      };
    } catch {
      return null;
    }
  }

  private async websocket(nowMs: number): Promise<Record<string, number> | null> {
    try {
      const lastCompleteMinute = Math.floor(nowMs / 60_000) - 1;
      const seen = await this.store.websocketHeartbeatSeen(lastCompleteMinute);
      if (!seen) return null;
      return await this.store.readWebsocketEmitMinute(websocketEmitRoomKinds as readonly string[], lastCompleteMinute);
    } catch {
      return null;
    }
  }

  /**
   * Package 5.4.0-f follow-up: the `login-429` metric of the last 60 complete
   * minutes. Read-only, and the keys come from the metrics service's own
   * builder - the numbers the admin graph shows and the numbers the alarm
   * compares are literally the same strings; a read failure yields `null` (the
   * observation stays inactive instead of firing on a number nobody measured).
   */
  /**
   * Paket 5.4.2 (stavka 4): the start of the audit webhook's failing streak, epoch ms.
   * `null` when nothing is pending or the state row cannot be read.
   */
  private async auditWebhookPendingSince(): Promise<number | null> {
    try {
      const row = await withTimeout(
        () =>
          this.prisma.securityAuditWebhookState.findUnique({
            where: { id: securityAuditWebhookStateId },
            select: { pendingSince: true },
          }),
        opsProbeTimeouts.databaseMs,
      );
      return row?.pendingSince ? row.pendingSince.getTime() : null;
    } catch {
      return null;
    }
  }

  /** Paket 5.4.2 (stavka 2): a captcha metric total, read with the metrics service's own keys; `null` on failure. */
  private async securityMetric(nowMs: number, event: LoginSecurityMetricEvent): Promise<number | null> {
    try {
      return await this.store.readSecurityMetricCount(event, new Date(nowMs), login429WindowMinutes);
    } catch {
      return null;
    }
  }

  private async login429(nowMs: number): Promise<number | null> {
    try {
      return await this.store.readLogin429Count(new Date(nowMs), login429WindowMinutes);
    } catch {
      return null;
    }
  }

  /** 5xx per minute for the last hour, for the dashboard graph. */
  async httpSeries(nowMs: number): Promise<Array<{ minute: number; errors5xx: number; total: number }>> {
    return this.store.readHttpCounters(Math.floor(nowMs / 60_000), 60);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all((this.queues ?? []).map((queue) => queue.close().catch(() => undefined)));
    this.connection?.disconnect();
  }

  private async disk(): Promise<OpsSignals['disk']> {
    try {
      const stats = await statfs(resolveUploadRoot());
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = (stats.blocks - stats.bfree) * stats.bsize;
      // Same formula as `df`: used / (used + available to unprivileged users).
      const usedPercent = used + free === 0 ? 0 : (used / (used + free)) * 100;
      return { usedPercent, freeBytes: free, totalBytes: total };
    } catch (error) {
      this.logger.warn(`ops_disk_probe_failed reason=${errorText(error)}`);
      return null;
    }
  }

  private async clamav(): Promise<OpsSignals['clamav']> {
    const configuration = readClamavConfiguration();
    if (configuration === null) return { configured: false };
    const ok = await pingClamav(configuration.host, configuration.port, opsProbeTimeouts.clamavMs);
    return { configured: true, ok, failOpen: configuration.failOpen };
  }

  private async http(nowMs: number): Promise<OpsSignals['http']> {
    try {
      const minutes = await this.store.readHttpCounters(Math.floor(nowMs / 60_000), 5);
      return minutes.reduce((sum, entry) => ({ errors5xx: sum.errors5xx + entry.errors5xx, total: sum.total + entry.total }), {
        errors5xx: 0,
        total: 0,
      });
    } catch {
      return null;
    }
  }

  private async inspectQueues(): Promise<{ schedulers: SchedulerSignal[]; queues: QueueSignal[] } | null> {
    try {
      const queues = this.openQueues();
      const perQueue = await Promise.all(
        queues.map((queue) => withTimeout(() => inspectQueue(queue), opsProbeTimeouts.queueMs).catch(() => null)),
      );
      const schedulers: SchedulerSignal[] = [];
      const counts: QueueSignal[] = [];
      const outcomes: QueueLastOutcome[] = [];
      for (const entry of perQueue) {
        if (entry === null) continue;
        schedulers.push(...entry.schedulers);
        counts.push(entry.counts);
        outcomes.push({
          queue: entry.counts.queue,
          lastSuccessMs: entry.lastSuccessMs,
          lastFailureMs: entry.lastFailureMs,
        });
      }
      return {
        schedulers: includeExpectedAssetSchedulers(schedulers, outcomes),
        queues: counts,
      };
    } catch (error) {
      this.logger.warn(`ops_queue_inspection_failed reason=${errorText(error)}`);
      return null;
    }
  }

  private openQueues(): Queue[] {
    if (this.queues !== null) return this.queues;
    const root = createBullMqRootConfiguration(loadRedisConfiguration());
    this.connection = new IORedis({ ...root.connection, lazyConnect: true, maxRetriesPerRequest: null });
    this.connection.on('error', () => undefined);
    this.queues = opsMonitoredQueueNames.map((name) => new Queue(name, { connection: this.connection!, prefix: root.prefix }));
    return this.queues;
  }
}

type QueueLastOutcome = {
  readonly queue: string;
  readonly lastSuccessMs: number | null;
  readonly lastFailureMs: number | null;
};

/**
 * Add expected assets scheduler rows even when Redis no longer contains their
 * registrations. The same row carries the queue's last successful execution,
 * so the health card and alarm gate do not silently lose that evidence.
 */
export function includeExpectedAssetSchedulers(
  schedulers: readonly SchedulerSignal[],
  outcomes: readonly QueueLastOutcome[],
): SchedulerSignal[] {
  const result = schedulers.map((scheduler): SchedulerSignal => {
    const expected = expectedAssetSchedulers.find(
      (candidate) =>
        candidate.queue === scheduler.queue &&
        schedulerIdMatches(scheduler.schedulerId, candidate.schedulerId),
    );
    return expected === undefined
      ? scheduler
      : {
          ...scheduler,
          registered: true,
          lastSuccessMaxAgeMs: expected.lastSuccessMaxAgeMs,
        };
  });

  for (const expected of expectedAssetSchedulers) {
    const alreadyPresent = result.some(
      (scheduler) =>
        scheduler.queue === expected.queue &&
        schedulerIdMatches(scheduler.schedulerId, expected.schedulerId),
    );
    if (alreadyPresent) continue;
    const outcome = outcomes.find((candidate) => candidate.queue === expected.queue);
    // An inspection timeout is unknown, not proof that a schedule is missing.
    if (outcome === undefined) continue;
    result.push({
      queue: expected.queue,
      schedulerId: expected.schedulerId,
      everyMs: null,
      pattern: expected.pattern,
      nextMs: null,
      lastSuccessMs: outcome.lastSuccessMs,
      lastFailureMs: outcome.lastFailureMs,
      registered: false,
      lastSuccessMaxAgeMs: expected.lastSuccessMaxAgeMs,
    });
  }
  return result;
}

function schedulerIdMatches(observed: string, expected: string): boolean {
  return observed === expected || observed.endsWith(`:${expected}`);
}

async function inspectQueue(queue: Queue): Promise<{
  schedulers: SchedulerSignal[];
  counts: QueueSignal;
  lastSuccessMs: number | null;
  lastFailureMs: number | null;
}> {
  const [jobSchedulers, jobCounts, completed, failed] = await Promise.all([
    queue.getJobSchedulers(0, 49, true),
    queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
    queue.getCompleted(0, 0),
    queue.getFailed(0, 0),
  ]);
  const lastSuccessMs = completed[0]?.finishedOn ?? null;
  const lastFailureMs = failed[0]?.finishedOn ?? null;
  return {
    schedulers: jobSchedulers.map((scheduler) => ({
      queue: queue.name,
      schedulerId: String(scheduler.key ?? scheduler.id ?? scheduler.name),
      everyMs: typeof scheduler.every === 'number' ? scheduler.every : scheduler.every === undefined || scheduler.every === null ? null : Number(scheduler.every),
      pattern: scheduler.pattern ?? null,
      nextMs: typeof scheduler.next === 'number' ? scheduler.next : null,
      lastSuccessMs,
      lastFailureMs,
    })),
    counts: {
      queue: queue.name,
      waiting: jobCounts.waiting ?? 0,
      active: jobCounts.active ?? 0,
      delayed: jobCounts.delayed ?? 0,
      failed: jobCounts.failed ?? 0,
    },
    lastSuccessMs,
    lastFailureMs,
  };
}

/** clamd answers the null-terminated `zPING` command with `PONG`. */
export function pingClamav(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let reply = '';
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.on('error', () => finish(false));
    socket.on('data', (chunk: Buffer) => {
      reply += chunk.toString('utf8');
      if (reply.includes('PONG')) finish(true);
    });
    socket.on('end', () => finish(reply.includes('PONG')));
    socket.connect(port, host, () => socket.write('zPING\0'));
  });
}

/** Earliest expiry in the configured LDAPS CA bundle, or null when none is set. */
export function ldapsCaExpiry(env: NodeJS.ProcessEnv = process.env): number | null {
  let pem: string | null;
  try {
    pem = readCaCertificate(env.AD_LDAPS_CA_CERT_PATH, env.AD_LDAPS_CA_CERT_BASE64);
  } catch {
    return null;
  }
  if (pem === null) return null;
  let earliest: number | null = null;
  for (const block of pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []) {
    try {
      const validTo = Date.parse(new X509Certificate(block).validTo);
      if (Number.isFinite(validTo)) earliest = earliest === null ? validTo : Math.min(earliest, validTo);
    } catch {
      // An unparsable block is reported by the directory sync itself.
    }
  }
  return earliest;
}

async function probe(work: () => Promise<unknown>, timeoutMs: number): Promise<'ok' | 'fail'> {
  try {
    await withTimeout(work, timeoutMs);
    return 'ok';
  } catch {
    return 'fail';
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
