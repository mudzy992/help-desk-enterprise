import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

@Injectable()
export class OnCallSweepSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(OnCallSweepSchedulerService.name);

  constructor(@InjectQueue(onCallSweepQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
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
