import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatJobMetrics } from '../../../common/scheduled-jobs/format-job-metrics';
import { DirectoryFullSyncService } from './directory-full-sync.service';
import {
  directorySyncJobLogContext,
  directorySyncJobName,
  directorySyncJobTimeoutMilliseconds,
  directorySyncQueueName,
} from './directory-sync.job.constants';

/** Paket 1.8 (A4): worker frame around the scheduled directory sync. */
@Processor(directorySyncQueueName, {
  concurrency: 1,
  lockDuration: directorySyncJobTimeoutMilliseconds,
})
export class DirectorySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(directorySyncJobLogContext);

  constructor(private readonly fullSync: DirectoryFullSyncService) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    const outcome = await this.fullSync.runScheduledIfDue();
    if (outcome !== 'skipped') {
      this.logger.log(
        formatJobMetrics({
          job: directorySyncJobName,
          durationMs: Date.now() - startedAt,
          processed: outcome === 'applied' ? 1 : 0,
          failed: outcome === 'aborted' ? 1 : 0,
        }),
      );
    }
  }
}
