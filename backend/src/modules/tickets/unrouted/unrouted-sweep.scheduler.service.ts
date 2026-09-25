import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../../common/scheduled-jobs/register-repeatable-job';
import {
  unroutedSweepCompletedJobsToKeep,
  unroutedSweepFailedJobsToKeep,
  unroutedSweepJobAttempts,
  unroutedSweepJobBackoffMilliseconds,
  unroutedSweepJobLabel,
  unroutedSweepJobName,
  unroutedSweepQueueName,
  unroutedSweepSchedulePattern,
  unroutedSweepSchedulerId,
} from './unrouted-sweep.job.constants';

/** Package 1.7 (U2): idempotent repeatable schedule in Redis. */
@Injectable()
export class UnroutedSweepSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(UnroutedSweepSchedulerService.name);

  constructor(@InjectQueue(unroutedSweepQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: unroutedSweepSchedulerId,
      jobName: unroutedSweepJobName,
      label: unroutedSweepJobLabel,
      schedule: { kind: 'pattern', pattern: unroutedSweepSchedulePattern },
      attempts: unroutedSweepJobAttempts,
      backoffMilliseconds: unroutedSweepJobBackoffMilliseconds,
      completedJobsToKeep: unroutedSweepCompletedJobsToKeep,
      failedJobsToKeep: unroutedSweepFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
