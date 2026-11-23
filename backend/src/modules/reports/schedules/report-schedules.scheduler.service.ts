import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { isSchedulerRegistered } from '../../../common/scheduled-jobs/job-scheduler-presence';
import { registerRepeatableJob } from '../../../common/scheduled-jobs/register-repeatable-job';
import {
  reportSchedulesCompletedJobsToKeep,
  reportSchedulesCronPattern,
  reportSchedulesFailedJobsToKeep,
  reportSchedulesJobAttempts,
  reportSchedulesJobBackoffMilliseconds,
  reportSchedulesJobLabel,
  reportSchedulesQueueName,
  reportSchedulesReconcileMilliseconds,
  reportSchedulesSchedulerId,
  reportSchedulesSweepJobName,
} from './report-schedule.constants';

/**
 * Idempotent by id: restarts and extra workers converge on one schedule.
 *
 * W7.98 (`BA-reports-08`): the registration used to be write-once-at-boot. The schedule lives in Redis, so a
 * restart without persistence, a `FLUSHALL`, a failover to an empty instance or a restore of an older snapshot
 * deleted it — and nothing complained. No sweep meant no scheduled report e-mail and no run log at all until the
 * next deploy. The worker now re-asserts its own schedule every minute (as the knowledge, change, problem and
 * asset sweeps do), and `scheduler.late` watches it as an expected scheduler so a loss that survives the
 * reconcile is an alarm instead of silence.
 */
@Injectable()
export class ReportSchedulesSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportSchedulesSchedulerService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(@InjectQueue(reportSchedulesQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.registerSchedule();
    if (this.reconcileTimer === null) {
      this.reconcileTimer = setInterval(() => {
        void this.reconcileSchedule().catch((error: unknown) => {
          // A reconcile that cannot reach Redis must not take the worker down: the next tick tries again and
          // `scheduler.late` reports the missing schedule.
          this.logger.error(
            `report_schedules_schedule_reconcile_failed type=${
              error instanceof Error ? error.name : 'UnknownError'
            }`,
          );
        });
      }, reportSchedulesReconcileMilliseconds);
      // The worker has its own keep-alive; this timer must never hold it open (nor keep a jest worker alive).
      this.reconcileTimer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer !== null) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  /** Restores the sweep scheduler when Redis lost it; returns the restored ids. */
  async reconcileSchedule(): Promise<readonly string[]> {
    const existing = await this.queue.getJobSchedulers(0, -1);
    if (isSchedulerRegistered(existing, reportSchedulesSchedulerId)) return [];
    await this.registerSchedule();
    this.logger.warn(`report_schedules_schedule_recovered id=${reportSchedulesSchedulerId}`);
    return [reportSchedulesSchedulerId];
  }

  private async registerSchedule(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: reportSchedulesSchedulerId,
      jobName: reportSchedulesSweepJobName,
      label: reportSchedulesJobLabel,
      schedule: { kind: 'pattern', pattern: reportSchedulesCronPattern },
      attempts: reportSchedulesJobAttempts,
      backoffMilliseconds: reportSchedulesJobBackoffMilliseconds,
      completedJobsToKeep: reportSchedulesCompletedJobsToKeep,
      failedJobsToKeep: reportSchedulesFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
