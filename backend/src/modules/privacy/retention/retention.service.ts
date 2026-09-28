import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { redisTokens } from '../../../common/redis/redis.tokens';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { TICKET_ATTACHMENT_STORAGE } from '../../tickets/attachments/attachment-storage.token';
import type { TicketAttachmentStorage } from '../../tickets/attachments/attachments.types';
import { PrivacyConfigurationLoader, type PrivacyConfiguration } from '../privacy-configuration.loader';
import {
  privacyErrorCodes,
  privacyLimits,
  retentionCategories,
  retentionCategoriesRequiringDryRun,
  type RetentionCategory,
} from '../privacy.constants';
import { PrivacyError } from '../privacy.error';
import { createRetentionExecutors, type RetentionExecutor } from './retention-executors';
import {
  evaluateExecutionGate,
  nightlyRunKey,
  retentionCutoff,
  retentionExecutionOrder,
  RetentionRefCollector,
  type ExecutionGate,
} from './retention-plan';

export type RetentionMode = 'DRY_RUN' | 'EXECUTE';

export type RetentionRunView = {
  readonly id: string;
  readonly category: RetentionCategory;
  readonly mode: RetentionMode;
  readonly status: 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  readonly configDays: number | null;
  readonly itemCount: number;
  readonly bytesFreed: number;
  readonly oldestAt: string | null;
  readonly newestAt: string | null;
  readonly refsCount: number;
  readonly refsTruncated: boolean;
  readonly error: string | null;
  readonly triggeredByUserId: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
};

export type RetentionCategoryView = {
  readonly category: RetentionCategory;
  readonly days: number;
  readonly enabled: boolean;
  readonly requiresDryRun: boolean;
  readonly gate: ExecutionGate;
  readonly lastDryRun: RetentionRunView | null;
  readonly lastExecution: RetentionRunView | null;
};

export type RetentionOverview = {
  readonly runAtLocalTime: string;
  readonly timeZone: string;
  readonly maxMinutesPerNight: number;
  readonly categories: readonly RetentionCategoryView[];
};

const runSelect = {
  id: true,
  category: true,
  mode: true,
  status: true,
  configDays: true,
  itemCount: true,
  bytesFreed: true,
  oldestAt: true,
  newestAt: true,
  refs: true,
  refsTruncated: true,
  error: true,
  triggeredByUserId: true,
  startedAt: true,
  finishedAt: true,
} as const;

type RunRecord = {
  readonly id: string;
  readonly category: string;
  readonly mode: string;
  readonly status: string;
  readonly configDays: number | null;
  readonly itemCount: number;
  readonly bytesFreed: bigint;
  readonly oldestAt: Date | null;
  readonly newestAt: Date | null;
  readonly refs: string[];
  readonly refsTruncated: boolean;
  readonly error: string | null;
  readonly triggeredByUserId: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
};

const nightKeyPrefix = 'privacy:retention:night:';
const nightKeyTtlSeconds = 36 * 60 * 60;
const lockKeyPrefix = 'privacy:retention:lock:';

/**
 * Paket 2.6 (§7): retention policies. Runs in the worker only (nightly, or a
 * dry run / manual run requested from the UI). Every run is a `RetentionRun`
 * row (counts, date range, ticket numbers — no content) and an audit entry.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly executors: Readonly<Record<RetentionCategory, RetentionExecutor>>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: PrivacyConfigurationLoader,
    @Inject(TICKET_ATTACHMENT_STORAGE) storage: TicketAttachmentStorage,
    @Inject(redisTokens.client) private readonly redis: Redis,
  ) {
    this.executors = createRetentionExecutors(prisma, storage);
  }

  /** Called every 15 minutes; runs once per local night inside the window. */
  async sweepNightly(now: Date = new Date()): Promise<readonly RetentionRunView[]> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled) return [];
    const nightKey = nightlyRunKey(now, configuration.timeZone, configuration.runAtLocalTime);
    if (nightKey === null) return [];
    // One run per night across all workers (and after restarts).
    const claimed = await this.redis.set(`${nightKeyPrefix}${nightKey}`, '1', 'EX', nightKeyTtlSeconds, 'NX');
    if (claimed !== 'OK') return [];
    const deadline = new Date(now.getTime() + configuration.maxMinutesPerNight * 60_000);
    const results: RetentionRunView[] = [];
    for (const category of retentionExecutionOrder) {
      if (configuration.retentionDays[category] <= 0) continue;
      if (Date.now() >= deadline.getTime()) break;
      try {
        results.push(
          await this.runCategory({ category, mode: 'EXECUTE', triggeredByUserId: null, deadline, configuration, now }),
        );
      } catch (error) {
        this.logger.warn(`privacy_retention_failed category=${category} reason=${errorText(error)}`);
      }
    }
    await this.prisma.retentionRun
      .deleteMany({
        where: { startedAt: { lt: new Date(now.getTime() - privacyLimits.runRetentionDays * 86_400_000) } },
      })
      .catch(() => null);
    return results;
  }

  /**
   * Runs one category. DRY_RUN only counts; EXECUTE is gated (§7.3) and runs
   * in batches until nothing is left or the deadline passes (PARTIAL — the
   * next night continues).
   */
  async runCategory(input: {
    readonly category: RetentionCategory;
    readonly mode: RetentionMode;
    readonly triggeredByUserId: string | null;
    readonly deadline: Date;
    readonly configuration?: PrivacyConfiguration;
    readonly now?: Date;
  }): Promise<RetentionRunView> {
    const configuration = input.configuration ?? (await this.configurationLoader.load());
    const now = input.now ?? new Date();
    const days = configuration.retentionDays[input.category];
    if (days <= 0) throw new PrivacyError(privacyErrorCodes.retentionDisabled, { category: input.category });
    // One run per category at a time (nightly vs. manual, several workers).
    const lockKey = `${lockKeyPrefix}${input.category}`;
    const locked = await this.redis.set(lockKey, '1', 'PX', privacyLimits.staleJobMs, 'NX');
    if (locked !== 'OK') throw new PrivacyError(privacyErrorCodes.alreadyRunning, { category: input.category });
    try {
      await this.releaseStaleRuns(now);
      return await this.runLocked(input, days, now);
    } finally {
      await this.redis.del(lockKey).catch(() => 0);
    }
  }

  private async runLocked(
    input: {
      readonly category: RetentionCategory;
      readonly mode: RetentionMode;
      readonly triggeredByUserId: string | null;
      readonly deadline: Date;
    },
    days: number,
    now: Date,
  ): Promise<RetentionRunView> {

    if (input.mode === 'EXECUTE') {
      const gate = evaluateExecutionGate({
        category: input.category,
        configDays: days,
        now,
        history: await this.history(input.category),
      });
      if (!gate.allowed) {
        const skipped = (await this.prisma.retentionRun.create({
          data: {
            category: input.category,
            mode: 'EXECUTE',
            status: 'SKIPPED',
            configDays: days,
            error: gate.reason,
            triggeredByUserId: input.triggeredByUserId,
            startedAt: now,
            finishedAt: now,
          },
          select: runSelect,
        })) as RunRecord;
        return toView(skipped);
      }
    }

    const cutoff = retentionCutoff(now, days);
    const run = await this.prisma.retentionRun.create({
      data: {
        category: input.category,
        mode: input.mode,
        status: 'RUNNING',
        configDays: days,
        triggeredByUserId: input.triggeredByUserId,
        startedAt: now,
      },
      select: { id: true },
    });
    const executor = this.executors[input.category];
    let finished: RunRecord;
    try {
      if (input.mode === 'DRY_RUN') {
        const preview = await executor.preview(cutoff);
        finished = (await this.prisma.retentionRun.update({
          where: { id: run.id },
          data: {
            status: 'COMPLETED',
            itemCount: preview.count,
            bytesFreed: preview.bytes,
            oldestAt: preview.oldestAt,
            newestAt: preview.newestAt,
            finishedAt: new Date(),
          },
          select: runSelect,
        })) as RunRecord;
      } else {
        finished = await this.execute(run.id, executor, cutoff, input.deadline);
      }
    } catch (error) {
      finished = (await this.prisma.retentionRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', error: errorText(error).slice(0, 1000), finishedAt: new Date() },
        select: runSelect,
      })) as RunRecord;
    }
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.privacyRetentionRun,
      entityType: auditLogEntityTypes.retentionRun,
      entityId: finished.id,
      metadata: {
        category: finished.category,
        mode: finished.mode,
        status: finished.status,
        configDays: days,
        items: finished.itemCount,
        bytes: finished.bytesFreed.toString(),
      },
      actorUserId: input.triggeredByUserId,
    }).catch((error: unknown) => this.logger.warn(`privacy_retention_audit_failed reason=${errorText(error)}`));
    return toView(finished);
  }

  async overview(now: Date = new Date()): Promise<RetentionOverview> {
    const configuration = await this.configurationLoader.load();
    const categories = await Promise.all(
      retentionCategories.map(async (category): Promise<RetentionCategoryView> => {
        const days = configuration.retentionDays[category];
        const [lastDryRun, lastExecution, history] = await Promise.all([
          this.prisma.retentionRun.findFirst({
            where: { category, mode: 'DRY_RUN' },
            orderBy: { startedAt: 'desc' },
            select: runSelect,
          }),
          this.prisma.retentionRun.findFirst({
            where: { category, mode: 'EXECUTE' },
            orderBy: { startedAt: 'desc' },
            select: runSelect,
          }),
          this.history(category),
        ]);
        return {
          category,
          days,
          enabled: days > 0,
          requiresDryRun: retentionCategoriesRequiringDryRun.includes(category),
          gate: evaluateExecutionGate({ category, configDays: days, now, history }),
          lastDryRun: lastDryRun === null ? null : toView(lastDryRun as RunRecord),
          lastExecution: lastExecution === null ? null : toView(lastExecution as RunRecord),
        };
      }),
    );
    return {
      runAtLocalTime: configuration.runAtLocalTime,
      timeZone: configuration.timeZone,
      maxMinutesPerNight: configuration.maxMinutesPerNight,
      categories,
    };
  }

  async listRuns(category?: RetentionCategory): Promise<RetentionRunView[]> {
    const rows = (await this.prisma.retentionRun.findMany({
      where: category === undefined ? {} : { category },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: privacyLimits.runsListed,
      select: runSelect,
    })) as RunRecord[];
    return rows.map(toView);
  }

  /** CSV of ticket numbers (or request ids) touched by a run — no content. */
  async runRefsCsv(id: string): Promise<{ readonly filename: string; readonly body: string }> {
    const run = (await this.prisma.retentionRun.findUnique({ where: { id }, select: runSelect })) as RunRecord | null;
    if (run === null) throw new PrivacyError(privacyErrorCodes.notFound);
    const lines = ['ref', ...run.refs.map((ref) => (/^[A-Za-z0-9_-]+$/.test(ref) ? ref : `"${ref.replace(/"/g, '""')}"`))];
    if (run.refsTruncated) lines.push('# truncated');
    return {
      filename: `retention-${run.category}-${run.startedAt.toISOString().slice(0, 10)}-${run.id}.csv`,
      body: `${lines.join('\n')}\n`,
    };
  }

  private async execute(
    runId: string,
    executor: RetentionExecutor,
    cutoff: Date,
    deadline: Date,
  ): Promise<RunRecord> {
    const refs = new RetentionRefCollector();
    let items = 0;
    let bytes = 0n;
    let failures = 0;
    let oldestAt: Date | null = null;
    let newestAt: Date | null = null;
    let done = false;
    while (!done && Date.now() < deadline.getTime()) {
      const batch = await executor.executeBatch(cutoff);
      items += batch.items;
      bytes += batch.bytes;
      failures += batch.failures;
      refs.add(batch.refs);
      if (batch.oldestAt !== null && (oldestAt === null || batch.oldestAt < oldestAt)) oldestAt = batch.oldestAt;
      if (batch.newestAt !== null && (newestAt === null || batch.newestAt > newestAt)) newestAt = batch.newestAt;
      done = batch.done;
    }
    const collected = refs.result();
    return (await this.prisma.retentionRun.update({
      where: { id: runId },
      data: {
        status: done && failures === 0 ? 'COMPLETED' : 'PARTIAL',
        itemCount: items,
        bytesFreed: bytes,
        oldestAt,
        newestAt,
        refs: collected.refs,
        refsTruncated: collected.truncated,
        error: failures > 0 ? `failures=${failures}` : done ? null : 'time_budget_exhausted',
        finishedAt: new Date(),
      },
      select: runSelect,
    })) as RunRecord;
  }

  private async history(category: RetentionCategory) {
    return this.prisma.retentionRun.findMany({
      where: { category, status: { in: ['COMPLETED', 'PARTIAL'] } },
      orderBy: { startedAt: 'desc' },
      take: privacyLimits.runsListed,
      select: { category: true, mode: true, status: true, configDays: true, startedAt: true },
    });
  }

  /** A RUNNING row older than staleJobMs belongs to a crashed worker. */
  private async releaseStaleRuns(now: Date): Promise<void> {
    await this.prisma.retentionRun.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - privacyLimits.staleJobMs) } },
      data: { status: 'FAILED', error: 'stale', finishedAt: now },
    });
  }
}

function toView(row: RunRecord): RetentionRunView {
  return {
    id: row.id,
    category: row.category as RetentionCategory,
    mode: row.mode as RetentionMode,
    status: row.status as RetentionRunView['status'],
    configDays: row.configDays,
    itemCount: row.itemCount,
    bytesFreed: Number(row.bytesFreed),
    oldestAt: row.oldestAt?.toISOString() ?? null,
    newestAt: row.newestAt?.toISOString() ?? null,
    refsCount: row.refs.length,
    refsTruncated: row.refsTruncated,
    error: row.error,
    triggeredByUserId: row.triggeredByUserId,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
