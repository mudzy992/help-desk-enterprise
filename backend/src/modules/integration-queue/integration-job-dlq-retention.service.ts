import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IntegrationJobRepository } from './integration-job.repository';
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class IntegrationJobDlqRetentionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IntegrationJobDlqRetentionService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly integrationJobRepository: IntegrationJobRepository,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const settings = await loadIntegrationQueueSettings(this.settingsService);
    this.timer = setInterval(() => {
      void this.sweep();
    }, settings.workerPollSeconds * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

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
