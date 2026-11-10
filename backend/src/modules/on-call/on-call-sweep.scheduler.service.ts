import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../common/scheduled-jobs/register-repeatable-job';
import {
  onCallSweepCompletedJobsToKeep,
  onCallSweepFailedJobsToKeep,
  onCallSweepJobAttempts,
  onCallSweepJobBackoffMilliseconds,
  onCallSweepJobLabel,
  onCallSweepJobName,
  onCallSweepQueueName,
  onCallSweepSchedulePattern,
  onCallSweepSchedulerId,
} from './on-call-sweep.job.constants';

/** How often the worker verifies its sweep schedule still exists in Redis. */
export const onCallSweepScheduleReconcileMilliseconds = 60_000;

type JobSchedulerLike = { readonly id?: string | null };

@Injectable()
export class OnCallSweepSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnCallSweepSchedulerService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(@InjectQueue(onCallSweepQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.registerSchedule();
    // BA-on-call-09: Redis can lose every scheduler after boot (flush,
    // failover to an empty instance). Without reconciliation the sweep
    // would never run again until a restart, so the worker periodically
    // verifies and restores it.
    this.reconcileTimer = setInterval(() => {
      void this.reconcileSchedules().catch((error: unknown) => {
        this.logger.error(
          `on_call_sweep_schedule_reconcile_failed type=${error instanceof Error ? error.name : 'UnknownError'}`,
        );
      });
    }, onCallSweepScheduleReconcileMilliseconds);
    this.reconcileTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer !== null) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  /** Restores the sweep scheduler if it is missing from Redis. */
  async reconcileSchedules(): Promise<readonly string[]> {
    const existing = (await this.queue.getJobSchedulers(0, -1)) as readonly JobSchedulerLike[];
    const present = new Set(existing.map((entry) => entry.id));
    if (present.has(onCallSweepSchedulerId)) return [];
    await this.registerSchedule();
    this.logger.warn(`on_call_sweep_schedule_recovered id=${onCallSweepSchedulerId}`);
    return [onCallSweepSchedulerId];
  }

  private async registerSchedule(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: onCallSweepSchedulerId,
      jobName: onCallSweepJobName,
      label: onCallSweepJobLabel,
      schedule: { kind: 'pattern', pattern: onCallSweepSchedulePattern },
      attempts: onCallSweepJobAttempts,
      backoffMilliseconds: onCallSweepJobBackoffMilliseconds,
      completedJobsToKeep: onCallSweepCompletedJobsToKeep,
      failedJobsToKeep: onCallSweepFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
