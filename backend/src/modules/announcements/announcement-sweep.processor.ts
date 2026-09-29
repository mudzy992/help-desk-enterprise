import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatJobMetrics } from '../../common/scheduled-jobs/format-job-metrics';
import { AnnouncementDeliveryService } from './announcement-delivery.service';
import { AnnouncementsService } from './announcements.service';
import {
  announcementSweepJobLogContext,
  announcementSweepJobName,
  announcementDeliveryBudgetMilliseconds,
  announcementSweepJobTimeoutMilliseconds,
  announcementSweepQueueName,
} from './announcement-sweep.job.constants';

@Processor(announcementSweepQueueName, { concurrency: 1, lockDuration: announcementSweepJobTimeoutMilliseconds })
export class AnnouncementSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(announcementSweepJobLogContext);

  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly delivery: AnnouncementDeliveryService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    try {
      const notified = await this.announcements.sweep();
      // K2b: e-mail batches and Teams posts; the budget leaves room under the job timeout.
      const delivered = (await this.announcements.isEnabled())
        ? await this.delivery.run(new Date(), announcementDeliveryBudgetMilliseconds)
        : { emailed: 0, teamsPosted: 0 };
      const processed = notified + delivered.emailed + delivered.teamsPosted;
      this.logger.log(formatJobMetrics({ job: announcementSweepJobName, durationMs: Date.now() - startedAt, processed, failed: 0 }));
    } catch (error) {
      this.logger.error(formatJobMetrics({ job: announcementSweepJobName, durationMs: Date.now() - startedAt, processed: 0, failed: 1 }));
      throw error;
    }
  }
}
