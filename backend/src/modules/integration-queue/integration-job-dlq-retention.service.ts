import { Injectable, Logger } from '@nestjs/common';
import { IntegrationJobRepository } from './integration-job.repository';
import { integrationJobDlqRetentionBatchSize } from './integration-queue.constants';
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class IntegrationJobDlqRetentionService {
  private readonly logger = new Logger(IntegrationJobDlqRetentionService.name);

  constructor(
    private readonly integrationJobRepository: IntegrationJobRepository,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Phase 4.1 (plan §4.1): the periodic trigger moved to a BullMQ schedule
   * (`integration-worker-maintenance.scheduler.service.ts`). Each sweep reads
   * current settings and deletes at most one bounded batch. A full batch may
   * indicate backlog and is reported without an unbounded drain loop.
   */
  async sweep(): Promise<number> {
    const settings = await loadIntegrationQueueSettings(this.settingsService);
    const before = new Date(
      Date.now() - settings.deadLetterRetentionDays * 24 * 60 * 60 * 1000,
    );
    const result =
      await this.integrationJobRepository.deleteDeadLetterOlderThan(before);
    if (result.count > 0) {
      this.logger.log(`Deleted ${result.count} expired DLQ integration jobs`);
    }
    if (result.count === integrationJobDlqRetentionBatchSize) {
      this.logger.warn('integration_dlq_retention_batch_limit_reached possible_backlog=true');
    }
    return result.count;
  }
}
