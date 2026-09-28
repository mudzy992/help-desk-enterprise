import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../common/scheduled-jobs/register-repeatable-job';
import { opsHealthIntervalMs, opsHealthJobName, opsHealthQueueName, opsHealthSchedulerId } from './ops-health.constants';

/** Idempotent by scheduler id: restarts and extra workers converge on one schedule. */
@Injectable()
export class OpsHealthSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(OpsHealthSchedulerService.name);

  constructor(@InjectQueue(opsHealthQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: opsHealthSchedulerId,
      jobName: opsHealthJobName,
      label: 'ops_health',
      schedule: { kind: 'every', milliseconds: opsHealthIntervalMs },
      // A missed round is replaced by the next one a minute later; no retry.
      attempts: 1,
      backoffMilliseconds: 1_000,
      completedJobsToKeep: 5,
      failedJobsToKeep: 20,
      logger: this.logger,
    });
  }
}
