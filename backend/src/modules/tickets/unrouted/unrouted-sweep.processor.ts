import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatJobMetrics } from '../../../common/scheduled-jobs/format-job-metrics';
import { UnroutedSweepService } from './unrouted-sweep.service';
import {
  unroutedSweepJobLogContext,
  unroutedSweepJobName,
  unroutedSweepJobTimeoutMilliseconds,
  unroutedSweepQueueName,
} from './unrouted-sweep.job.constants';

/** Package 1.7 (U2): worker frame around `UnroutedSweepService.processDue()`. */
@Processor(unroutedSweepQueueName, {
  // Phase 4.1: one run at a time — a slow sweep delays the next tick instead of
  // overlapping it, and the queue lock keeps a second worker off the same run.
  concurrency: 1,
  lockDuration: unroutedSweepJobTimeoutMilliseconds,
})
export class UnroutedSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(unroutedSweepJobLogContext);

  constructor(private readonly sweep: UnroutedSweepService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await this.sweep.processDue();
      const processed = result.notifications + result.digestNotifications;
      this.logger.log(
        formatJobMetrics({
          job: unroutedSweepJobName,
          durationMs: Date.now() - startedAt,
          processed,
          failed: 0,
        }),
      );
    } catch (error) {
      this.logger.error(
        formatJobMetrics({
          job: unroutedSweepJobName,
          durationMs: Date.now() - startedAt,
          processed: 0,
          failed: 1,
        }),
      );
      throw error;
    }
  }
}
