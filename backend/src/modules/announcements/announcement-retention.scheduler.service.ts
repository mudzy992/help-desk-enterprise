import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../common/scheduled-jobs/register-repeatable-job';
import {
  announcementRetentionCompletedJobsToKeep,
  announcementRetentionFailedJobsToKeep,
  announcementRetentionJobAttempts,
  announcementRetentionJobBackoffMilliseconds,
  announcementRetentionJobLabel,
  announcementRetentionJobName,
  announcementRetentionQueueName,
  announcementRetentionSchedulePattern,
  announcementRetentionSchedulerId,
} from './announcement-retention.job.constants';

/** BA-announcements-17: same 60 s scheduler self-heal cadence as the sweep. */
export const announcementRetentionReconcileMilliseconds = 60_000;

type JobSchedulerLike = { readonly id?: string | null };

@Injectable()
export class AnnouncementRetentionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementRetentionSchedulerService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(@InjectQueue(announcementRetentionQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.registerSchedule();
    this.reconcileTimer = setInterval(() => {
      void this.reconcileSchedule().catch((error: unknown) => {
        this.logger.error(
          `announcement_retention_schedule_reconcile_failed type=${error instanceof Error ? error.name : 'UnknownError'}`,
        );
      });
    }, announcementRetentionReconcileMilliseconds);
    this.reconcileTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer !== null) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  /** Restores the retention scheduler when Redis lost it; returns restored ids. */
  async reconcileSchedule(): Promise<readonly string[]> {
    const existing = (await this.queue.getJobSchedulers(0, -1)) as readonly JobSchedulerLike[];
    const present = new Set(existing.map((entry) => entry.id));
    if (present.has(announcementRetentionSchedulerId)) return [];
    await this.registerSchedule();
    this.logger.warn(`announcement_retention_schedule_recovered id=${announcementRetentionSchedulerId}`);
    return [announcementRetentionSchedulerId];
  }

  private async registerSchedule(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: announcementRetentionSchedulerId,
      jobName: announcementRetentionJobName,
      label: announcementRetentionJobLabel,
      schedule: { kind: 'pattern', pattern: announcementRetentionSchedulePattern },
      attempts: announcementRetentionJobAttempts,
      backoffMilliseconds: announcementRetentionJobBackoffMilliseconds,
      completedJobsToKeep: announcementRetentionCompletedJobsToKeep,
      failedJobsToKeep: announcementRetentionFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
