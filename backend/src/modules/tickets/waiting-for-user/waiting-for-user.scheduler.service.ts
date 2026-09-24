import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../../common/scheduled-jobs/register-repeatable-job';
import {
  waitingForUserCompletedJobsToKeep,
  waitingForUserFailedJobsToKeep,
  waitingForUserJobAttempts,
  waitingForUserJobBackoffMilliseconds,
  waitingForUserJobLabel,
  waitingForUserJobName,
  waitingForUserQueueName,
  waitingForUserSchedulePattern,
  waitingForUserSchedulerId,
} from './waiting-for-user.job.constants';

/**
 * Phase 4.1 (plan §4.1): the schedule lives in Redis and is idempotent by id, so
 * two worker instances converge on exactly one occurrence per slot.
 */
@Injectable()
export class WaitingForUserSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(WaitingForUserSchedulerService.name);

  constructor(@InjectQueue(waitingForUserQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: waitingForUserSchedulerId,
      jobName: waitingForUserJobName,
      label: waitingForUserJobLabel,
      schedule: { kind: 'pattern', pattern: waitingForUserSchedulePattern },
      attempts: waitingForUserJobAttempts,
      backoffMilliseconds: waitingForUserJobBackoffMilliseconds,
      completedJobsToKeep: waitingForUserCompletedJobsToKeep,
      failedJobsToKeep: waitingForUserFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
