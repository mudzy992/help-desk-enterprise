import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatJobMetrics } from '../../common/scheduled-jobs/format-job-metrics';
import { KnowledgeBaseReviewReminderService } from './knowledge-base-review-reminder.service';
import {
  knowledgeBaseReviewReminderJobLogContext,
  knowledgeBaseReviewReminderJobName,
  knowledgeBaseReviewReminderJobTimeoutMilliseconds,
  knowledgeBaseReviewReminderQueueName,
} from './knowledge-base-review-reminder.job.constants';

/**
 * Phase 4.1 (plan §4.1): the sweep runs here — in the worker process — so the API
 * log carries no job iterations at all. The business logic is untouched; this is
 * only the frame around `processDue()`.
 */
@Processor(knowledgeBaseReviewReminderQueueName, {
  // Phase 4.1: one run at a time — a slow sweep delays the next tick instead of
  // overlapping it, and the queue lock keeps a second worker off the same run.
  concurrency: 1,
  lockDuration: knowledgeBaseReviewReminderJobTimeoutMilliseconds,
})
export class KnowledgeBaseReviewReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(knowledgeBaseReviewReminderJobLogContext);

  constructor(private readonly automation: KnowledgeBaseReviewReminderService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    try {
      // This sweep reports a plain count (notifications actually sent), unlike the
      // ticket sweeps which return the rows they touched.
      const processed = await this.automation.processDue();
      this.logger.log(
        formatJobMetrics({
          job: knowledgeBaseReviewReminderJobName,
          durationMs: Date.now() - startedAt,
          processed,
          failed: 0,
        }),
      );
    } catch (error) {
      this.logger.error(
        formatJobMetrics({
          job: knowledgeBaseReviewReminderJobName,
          durationMs: Date.now() - startedAt,
          processed: 0,
          failed: 1,
        }),
      );
      throw error;
    }
  }
}
