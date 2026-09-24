import { Injectable, Logger } from '@nestjs/common';
import { IntegrationJobRepository } from './integration-job.repository';
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
   * (`integration-worker-maintenance.scheduler.service.ts`); the sweep itself — and
   * the settings it reads on every run — is unchanged. Unlike the old timer, two
   * workers now produce one sweep per interval instead of two.
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
    return result.count;
  }
}
