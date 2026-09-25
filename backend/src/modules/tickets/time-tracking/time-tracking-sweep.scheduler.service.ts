import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../../common/scheduled-jobs/register-repeatable-job';
import {
  timeTrackingSweepCompletedJobsToKeep,
  timeTrackingSweepFailedJobsToKeep,
  timeTrackingSweepJobAttempts,
  timeTrackingSweepJobBackoffMilliseconds,
  timeTrackingSweepJobLabel,
  timeTrackingSweepJobName,
  timeTrackingSweepQueueName,
  timeTrackingSweepSchedulePattern,
  timeTrackingSweepSchedulerId,
} from './time-tracking-sweep.job.constants';

@Injectable()
export class TimeTrackingSweepSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TimeTrackingSweepSchedulerService.name);

  constructor(@InjectQueue(timeTrackingSweepQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: timeTrackingSweepSchedulerId,
      jobName: timeTrackingSweepJobName,
      label: timeTrackingSweepJobLabel,
      schedule: { kind: 'pattern', pattern: timeTrackingSweepSchedulePattern },
      attempts: timeTrackingSweepJobAttempts,
      backoffMilliseconds: timeTrackingSweepJobBackoffMilliseconds,
      completedJobsToKeep: timeTrackingSweepCompletedJobsToKeep,
      failedJobsToKeep: timeTrackingSweepFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
