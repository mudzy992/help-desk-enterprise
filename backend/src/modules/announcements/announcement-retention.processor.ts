import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatJobMetrics } from '../../common/scheduled-jobs/format-job-metrics';
import { AnnouncementsService } from './announcements.service';
import {
  announcementRetentionJobLogContext,
  announcementRetentionJobName,
  announcementRetentionJobTimeoutMilliseconds,
  announcementRetentionQueueName,
} from './announcement-retention.job.constants';

/**
 * BA-announcements-17: retention as its own job. Failures propagate so the
 * job actually fails (BullMQ retries with backoff) and the failed metric is
 * logged — the opposite of the previous best-effort in-sweep behaviour.
 */
@Processor(announcementRetentionQueueName, {
  concurrency: 1,
  lockDuration: announcementRetentionJobTimeoutMilliseconds,
})
export class AnnouncementRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(announcementRetentionJobLogContext);

  constructor(private readonly announcements: AnnouncementsService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    try {
      const deleted = await this.announcements.runRetention(new Date());
      this.logger.log(
        formatJobMetrics({ job: announcementRetentionJobName, durationMs: Date.now() - startedAt, processed: deleted, failed: 0 }),
      );
    } catch (error) {
      this.logger.error(
        formatJobMetrics({ job: announcementRetentionJobName, durationMs: Date.now() - startedAt, processed: 0, failed: 1 }),
      );
      throw error;
    }
  }
}
