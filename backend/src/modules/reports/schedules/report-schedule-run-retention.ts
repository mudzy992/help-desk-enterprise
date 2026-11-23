import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  reportScheduleLimits,
  reportScheduleRunRetentionBatchSize,
  reportScheduleRunRetentionMaxBatches,
} from './report-schedule.constants';

const dayMilliseconds = 86_400_000;

export type ReportScheduleRunRetentionResult = {
  /** Rows this pass removed. */
  readonly deleted: number;
  /** Runs created before this instant are outside the retention window. */
  readonly cutoff: Date;
  /** Delete rounds this pass needed (a round deletes at most one batch). */
  readonly batches: number;
  /** True when the batch budget ran out before the backlog did; the next pass continues. */
  readonly remaining: boolean;
};

/** The run-log side of the retention contract; a `PrismaService` satisfies it. */
export type ReportScheduleRunRetentionDelegate = {
  readonly reportScheduleRun: Pick<
    PrismaService['reportScheduleRun'],
    'findMany' | 'deleteMany'
  >;
};

/**
 * W7.103 (`BA-reports-14`): the 180-day run-log retention used to be one unbounded `deleteMany` inside the
 * delivery sweep, guarded by `.catch(() => undefined)`. That made it best-effort in three ways: it only ran when
 * the sweep ran, it silently stopped when scheduled e-mail was disabled (the sweep returned before pruning), and a
 * failure was invisible. A backlog large enough to hold a long lock was also deleted in a single transaction.
 *
 * This pass is bounded and observable: it deletes one batch of ids at a time, stops at a batch budget and reports
 * whether a backlog remains, and **throws** on a database error so the caller can log or retry it instead of
 * swallowing it. Deleting by id makes a pass idempotent and safe next to another worker's pass.
 */
export async function pruneReportScheduleRuns(
  prisma: ReportScheduleRunRetentionDelegate,
  options: {
    readonly now: Date;
    readonly retentionDays?: number;
    readonly batchSize?: number;
    readonly maxBatches?: number;
  },
): Promise<ReportScheduleRunRetentionResult> {
  const retentionDays = options.retentionDays ?? reportScheduleLimits.runRetentionDays;
  const batchSize = options.batchSize ?? reportScheduleRunRetentionBatchSize;
  const maxBatches = options.maxBatches ?? reportScheduleRunRetentionMaxBatches;
  const cutoff = new Date(options.now.getTime() - retentionDays * dayMilliseconds);
  let deleted = 0;
  let batches = 0;

  while (batches < maxBatches) {
    const expired = await prisma.reportScheduleRun.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
    if (expired.length === 0) {
      return { deleted, cutoff, batches, remaining: false };
    }
    const removed = await prisma.reportScheduleRun.deleteMany({
      where: { id: { in: expired.map((run) => run.id) } },
    });
    deleted += removed.count;
    batches += 1;
    // A short batch means the window is empty now; a full batch may hide more, so the loop asks again.
    if (expired.length < batchSize) {
      return { deleted, cutoff, batches, remaining: false };
    }
  }

  const probe = await prisma.reportScheduleRun.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    take: 1,
  });
  return { deleted, cutoff, batches, remaining: probe.length > 0 };
}
