import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

@Injectable()
export class AnnouncementSweepSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AnnouncementSweepSchedulerService.name);

  constructor(@InjectQueue(announcementSweepQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
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
