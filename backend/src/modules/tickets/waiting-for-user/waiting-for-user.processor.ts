import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatJobMetrics } from '../../../common/scheduled-jobs/format-job-metrics';
import { WaitingForUserAutomationService } from './waiting-for-user-automation.service';
import {
  waitingForUserJobLogContext,
  waitingForUserJobName,
  waitingForUserJobTimeoutMilliseconds,
  waitingForUserQueueName,
} from './waiting-for-user.job.constants';

/**
 * Phase 4.1 (plan §4.1): the sweep runs here — in the worker process — so the API
 * log carries no job iterations at all. The business logic is untouched; this is
 * only the frame around `processDue()`.
 */
@Processor(waitingForUserQueueName, {
  // Phase 4.1: one run at a time — a slow sweep delays the next tick instead of
  // overlapping it, and the queue lock keeps a second worker off the same run.
  concurrency: 1,
  lockDuration: waitingForUserJobTimeoutMilliseconds,
})
export class WaitingForUserProcessor extends WorkerHost {
  private readonly logger = new Logger(waitingForUserJobLogContext);

  constructor(private readonly automation: WaitingForUserAutomationService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    try {
      const processed = (await this.automation.processDue()).length;
      this.logger.log(
        formatJobMetrics({
          job: waitingForUserJobName,
          durationMs: Date.now() - startedAt,
          processed,
          failed: 0,
        }),
      );
    } catch (error) {
      this.logger.error(
        formatJobMetrics({
          job: waitingForUserJobName,
          durationMs: Date.now() - startedAt,
          processed: 0,
          failed: 1,
        }),
      );
      throw error;
    }
  }
}
