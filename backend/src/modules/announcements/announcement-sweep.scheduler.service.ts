import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../common/scheduled-jobs/register-repeatable-job';
import {
  announcementSweepCompletedJobsToKeep,
  announcementSweepFailedJobsToKeep,
  announcementSweepJobAttempts,
  announcementSweepJobBackoffMilliseconds,
  announcementSweepJobLabel,
  announcementSweepJobName,
  announcementSweepQueueName,
  announcementSweepSchedulePattern,
  announcementSweepSchedulerId,
} from './announcement-sweep.job.constants';

/** How often the worker verifies its mandatory schedule still exists in Redis. */
export const announcementSweepReconcileMilliseconds = 60_000;

type JobSchedulerLike = { readonly id?: string | null };

@Injectable()
export class AnnouncementSweepSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementSweepSchedulerService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(@InjectQueue(announcementSweepQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.registerSchedule();
    // BA-announcements-11: Redis can lose every scheduler after boot (flush,
    // failover to an empty instance). Without reconciliation the sweep would
    // never run again until a restart, so the worker periodically verifies
    // and restores it (idempotent by scheduler id on every worker).
    this.reconcileTimer = setInterval(() => {
      void this.reconcileSchedule().catch((error: unknown) => {
        this.logger.error(
          `announcement_sweep_schedule_reconcile_failed type=${error instanceof Error ? error.name : 'UnknownError'}`,
        );
      });
    }, announcementSweepReconcileMilliseconds);
    this.reconcileTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer !== null) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  /** Restores the sweep scheduler when Redis lost it; returns restored ids. */
  async reconcileSchedule(): Promise<readonly string[]> {
    const existing = (await this.queue.getJobSchedulers(0, -1)) as readonly JobSchedulerLike[];
    const present = new Set(existing.map((entry) => entry.id));
    if (present.has(announcementSweepSchedulerId)) return [];
    await this.registerSchedule();
    this.logger.warn(`announcement_sweep_schedule_recovered id=${announcementSweepSchedulerId}`);
    return [announcementSweepSchedulerId];
  }

  private async registerSchedule(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: announcementSweepSchedulerId,
      jobName: announcementSweepJobName,
      label: announcementSweepJobLabel,
      schedule: { kind: 'pattern', pattern: announcementSweepSchedulePattern },
      attempts: announcementSweepJobAttempts,
      backoffMilliseconds: announcementSweepJobBackoffMilliseconds,
      completedJobsToKeep: announcementSweepCompletedJobsToKeep,
      failedJobsToKeep: announcementSweepFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
