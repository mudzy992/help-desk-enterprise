import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../../common/scheduled-jobs/register-repeatable-job';
import {
  directorySyncCompletedJobsToKeep,
  directorySyncFailedJobsToKeep,
  directorySyncJobAttempts,
  directorySyncJobBackoffMilliseconds,
  directorySyncJobLabel,
  directorySyncJobName,
  directorySyncQueueName,
  directorySyncSchedulePattern,
  directorySyncSchedulerId,
} from './directory-sync.job.constants';

/** Paket 1.8 (A4): idempotent repeatable tick in Redis. */
@Injectable()
export class DirectorySyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(DirectorySyncSchedulerService.name);

  constructor(@InjectQueue(directorySyncQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: directorySyncSchedulerId,
      jobName: directorySyncJobName,
      label: directorySyncJobLabel,
      schedule: { kind: 'pattern', pattern: directorySyncSchedulePattern },
      attempts: directorySyncJobAttempts,
      backoffMilliseconds: directorySyncJobBackoffMilliseconds,
      completedJobsToKeep: directorySyncCompletedJobsToKeep,
      failedJobsToKeep: directorySyncFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
