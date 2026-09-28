import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { privacyJobs, privacyQueueName, retentionCategories, type RetentionCategory } from './privacy.constants';
import { PrivacyConfigurationLoader } from './privacy-configuration.loader';
import { DataSubjectRequestsService } from './requests/data-subject-requests.service';
import { RetentionService } from './retention/retention.service';

@Processor(privacyQueueName)
export class PrivacyProcessor extends WorkerHost {
  private readonly logger = new Logger('Privacy');

  constructor(
    private readonly requestsService: DataSubjectRequestsService,
    private readonly retentionService: RetentionService,
    private readonly configurationLoader: PrivacyConfigurationLoader,
  ) {
    super();
  }

  async process(job: Job<{ category?: unknown; actorUserId?: unknown }>): Promise<void> {
    switch (job.name) {
      case privacyJobs.maintenance: {
        const sent = await this.requestsService.sendDueReminders().catch((error: unknown) => {
          this.logger.warn(`privacy_request_reminders_failed reason=${errorText(error)}`);
          return 0;
        });
        if (sent > 0) this.logger.log(`privacy_request_reminders sent=${sent}`);
        const runs = await this.retentionService.sweepNightly();
        for (const run of runs) {
          this.logger.log(
            `privacy_retention category=${run.category} status=${run.status} items=${run.itemCount}`,
          );
        }
        return;
      }
      case privacyJobs.retentionDryRun:
      case privacyJobs.retentionRunNow: {
        const category = readCategory(job.data.category);
        if (category === null) return;
        const actorUserId = typeof job.data.actorUserId === 'string' ? job.data.actorUserId : null;
        const configuration = await this.configurationLoader.load();
        const run = await this.retentionService.runCategory({
          category,
          mode: job.name === privacyJobs.retentionDryRun ? 'DRY_RUN' : 'EXECUTE',
          triggeredByUserId: actorUserId,
          deadline: new Date(Date.now() + configuration.maxMinutesPerNight * 60_000),
          configuration,
        });
        this.logger.log(
          `privacy_retention_manual category=${category} mode=${run.mode} status=${run.status} items=${run.itemCount}`,
        );
        return;
      }
      default:
        this.logger.warn(`privacy_job_unknown name=${job.name}`);
    }
  }
}

function readCategory(value: unknown): RetentionCategory | null {
  return typeof value === 'string' && (retentionCategories as readonly string[]).includes(value)
    ? (value as RetentionCategory)
    : null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
