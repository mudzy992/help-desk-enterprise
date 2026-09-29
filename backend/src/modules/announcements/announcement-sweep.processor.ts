import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatJobMetrics } from '../../common/scheduled-jobs/format-job-metrics';
import { AnnouncementsService } from './announcements.service';
import {
  announcementSweepJobLogContext,
  announcementSweepJobName,
  announcementSweepJobTimeoutMilliseconds,
  announcementSweepQueueName,
} from './announcement-sweep.job.constants';

@Processor(announcementSweepQueueName, { concurrency: 1, lockDuration: announcementSweepJobTimeoutMilliseconds })
export class AnnouncementSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(announcementSweepJobLogContext);

  constructor(private readonly announcements: AnnouncementsService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    try {
      const processed = await this.announcements.sweep();
      this.logger.log(formatJobMetrics({ job: announcementSweepJobName, durationMs: Date.now() - startedAt, processed, failed: 0 }));
    } catch (error) {
      this.logger.error(formatJobMetrics({ job: announcementSweepJobName, durationMs: Date.now() - startedAt, processed: 0, failed: 1 }));
      throw error;
    }
  }
}
