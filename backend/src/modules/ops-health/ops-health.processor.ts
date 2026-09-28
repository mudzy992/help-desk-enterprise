import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { opsHealthJobName, opsHealthLockDurationMs, opsHealthQueueName } from './ops-health.constants';
import { OpsHealthRunner } from './ops-health.runner';

@Processor(opsHealthQueueName, { concurrency: 1, lockDuration: opsHealthLockDurationMs })
export class OpsHealthProcessor extends WorkerHost {
  private readonly logger = new Logger('OpsHealth');

  constructor(private readonly runner: OpsHealthRunner) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== opsHealthJobName) {
      this.logger.warn(`ops_health_unknown_job name=${job.name}`);
      return;
    }
    await this.runner.run();
  }
}
