import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatJobMetrics } from '../../common/scheduled-jobs/format-job-metrics';
import { OnCallSweepService } from './on-call-sweep.service';
import {
  onCallSweepJobLogContext,
  onCallSweepJobName,
  onCallSweepJobTimeoutMilliseconds,
  onCallSweepQueueName,
} from './on-call-sweep.job.constants';

@Processor(onCallSweepQueueName, { concurrency: 1, lockDuration: onCallSweepJobTimeoutMilliseconds })
export class OnCallSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(onCallSweepJobLogContext);

  constructor(private readonly sweep: OnCallSweepService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    try {
      const processed = await this.sweep.processDue();
      this.logger.log(formatJobMetrics({ job: onCallSweepJobName, durationMs: Date.now() - startedAt, processed, failed: 0 }));
    } catch (error) {
      this.logger.error(formatJobMetrics({ job: onCallSweepJobName, durationMs: Date.now() - startedAt, processed: 0, failed: 1 }));
      throw error;
    }
  }
}
