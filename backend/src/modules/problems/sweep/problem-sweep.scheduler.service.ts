import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { isSchedulerRegistered } from '../../../common/scheduled-jobs/job-scheduler-presence';
import { registerRepeatableJob } from '../../../common/scheduled-jobs/register-repeatable-job';
import {
  problemSweepCompletedJobsToKeep,
  problemSweepCronPattern,
  problemSweepFailedJobsToKeep,
  problemSweepJobAttempts,
  problemSweepJobBackoffMilliseconds,
  problemSweepJobLabel,
  problemSweepJobName,
  problemSweepQueueName,
  problemSweepReconcileMilliseconds,
  problemSweepSchedulerId,
} from './problem-sweep.constants';

/**
 * Paket 3.3 (P5) registered the hourly sweep once, on module init. W7.32
 * (BA-problems-14) closes the two holes that left behind:
 *
 * - **Redis loss after boot** (flush, failover to an empty instance) deleted the
 *   scheduler; nothing put it back until the next deploy, so target reminders and
 *   auto-close stopped silently. Every worker now verifies the schedule once a
 *   minute and restores it — idempotent by scheduler id, so N workers converge on
 *   exactly one schedule.
 * - **A swallowed registration error**: the old catch logged and rethrew, so the
 *   boot failed fast (that part was already right), but a failure *after* boot had
 *   nobody to notice it. The reconcile loop logs every failed attempt as
 *   `problem_sweep_schedule_reconcile_failed` and the next minute tries again.
 *
 * The health side lives in `ops-health`: the sweep is an expected scheduler, so
 * `scheduler.late` reports `not_registered` (a missing schedule), `not_picked_up`,
 * `failing` and `no_recent_success` (last sweep, and with it the last auto-close,
 * older than one hourly window plus grace).
 */
@Injectable()
export class ProblemSweepSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProblemSweepSchedulerService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(@InjectQueue(problemSweepQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // The sweep is mandatory: a worker that cannot register it must not pretend
    // to be healthy, so the boot fails (the retry is the restart).
    await this.registerSchedule();
    this.reconcileTimer = setInterval(() => {
      void this.reconcileSchedule().catch((error: unknown) => {
        this.logger.error(
          `problem_sweep_schedule_reconcile_failed type=${error instanceof Error ? error.name : 'UnknownError'}`,
        );
      });
    }, problemSweepReconcileMilliseconds);
    // A timer must not keep the process alive on a graceful shutdown.
    this.reconcileTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer !== null) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  /** Restores the sweep scheduler when Redis lost it; returns the restored ids. */
  async reconcileSchedule(): Promise<readonly string[]> {
    const existing = await this.queue.getJobSchedulers(0, -1);
    if (isSchedulerRegistered(existing, problemSweepSchedulerId)) return [];
    await this.registerSchedule();
    this.logger.warn(`problem_sweep_schedule_recovered id=${problemSweepSchedulerId}`);
    return [problemSweepSchedulerId];
  }

  private async registerSchedule(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: problemSweepSchedulerId,
      jobName: problemSweepJobName,
      label: problemSweepJobLabel,
      schedule: { kind: 'pattern', pattern: problemSweepCronPattern },
      attempts: problemSweepJobAttempts,
      backoffMilliseconds: problemSweepJobBackoffMilliseconds,
      completedJobsToKeep: problemSweepCompletedJobsToKeep,
      failedJobsToKeep: problemSweepFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
