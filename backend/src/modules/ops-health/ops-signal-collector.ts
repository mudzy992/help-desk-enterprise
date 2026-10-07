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
import type { OpsSignals, QueueSignal, SchedulerSignal } from './evaluate-ops-signals';
import { opsMonitoredQueueNames, opsProbeTimeouts } from './ops-health.constants';
import { OpsStateStore } from './ops-state.store';

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
    const [disk, clamav, bull, integrationDlq, http, eventLoopLagMs, websocketEmits] = await Promise.all([
      this.disk(),
      this.clamav(),
      redis === 'ok' ? this.inspectQueues() : Promise.resolve(null),
      database === 'ok'
        ? withTimeout(() => this.prisma.integrationJob.count({ where: { status: 'DLQ' } }), opsProbeTimeouts.databaseMs).catch(() => null)
        : Promise.resolve(null),
      redis === 'ok' ? this.http(nowMs) : Promise.resolve(null),
      redis === 'ok' ? this.store.readEventLoopLagMs().catch(() => null) : Promise.resolve(null),
      redis === 'ok' ? this.websocket(nowMs) : Promise.resolve(null),
    ]);
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
    };
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
      for (const entry of perQueue) {
        if (entry === null) continue;
        schedulers.push(...entry.schedulers);
        counts.push(entry.counts);
      }
      return { schedulers, queues: counts };
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

async function inspectQueue(queue: Queue): Promise<{ schedulers: SchedulerSignal[]; counts: QueueSignal }> {
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
