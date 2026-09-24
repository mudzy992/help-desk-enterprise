import type { Queue, RepeatOptions } from 'bullmq';

/** Either an interval (`every`) or a cron pattern — both are BullMQ repeat options. */
export type RepeatableJobSchedule =
  | { readonly kind: 'every'; readonly milliseconds: number }
  | { readonly kind: 'pattern'; readonly pattern: string };

export type RepeatableJobRegistration = {
  readonly queue: Pick<Queue, 'upsertJobScheduler'>;
  readonly schedulerId: string;
  readonly jobName: string;
  readonly label: string;
  readonly schedule: RepeatableJobSchedule;
  readonly attempts: number;
  readonly backoffMilliseconds: number;
  readonly completedJobsToKeep: number;
  readonly failedJobsToKeep: number;
  readonly logger: { warn(message: string): void };
};

/**
 * Phase 4.1 (plan §4.1): every periodic job is registered the same way Phase 2.1
 * registered the SLA scan.
 *
 * - `upsertJobScheduler` is idempotent **by scheduler id**, so two worker
 *   instances converge on exactly one schedule (the "exactly once per schedule"
 *   requirement) and a restart never doubles a job.
 * - BullMQ hands a due job to a single worker; the lock is the queue's, not ours.
 * - `attempts` + `backoff` define the retry and the keep-counts are the DLQ
 *   policy (failed jobs stay inspectable, then expire).
 *
 * Note on the per-job **timeout**: BullMQ v5 has no `opts.timeout` on a job (it
 * only exists in the Pro edition), so the budget is enforced where the framework
 * does support it — `lockDuration` on the processor's worker, set from the same
 * constant (`…JobTimeoutMilliseconds`). A job that overruns loses its lock and is
 * marked stalled, which is the same operational outcome: a visible failure that
 * the queue retries instead of a silently stuck worker.
 * - A worker that cannot reach Redis keeps running for its other queues: the
 *   failure is logged, not thrown.
 */
export async function registerRepeatableJob(
  registration: RepeatableJobRegistration,
): Promise<void> {
  try {
    await registration.queue.upsertJobScheduler(
      registration.schedulerId,
      toRepeatOptions(registration.schedule),
      {
        name: registration.jobName,
        data: {},
        opts: {
          attempts: registration.attempts,
          backoff: {
            type: 'exponential',
            delay: registration.backoffMilliseconds,
          },
          removeOnComplete: { count: registration.completedJobsToKeep },
          removeOnFail: { count: registration.failedJobsToKeep },
        },
      },
    );
  } catch (error) {
    registration.logger.warn(
      `${registration.label}_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function toRepeatOptions(schedule: RepeatableJobSchedule): RepeatOptions {
  return schedule.kind === 'every'
    ? { every: schedule.milliseconds }
    : { pattern: schedule.pattern };
}
