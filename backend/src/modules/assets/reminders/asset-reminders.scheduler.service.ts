import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  assetRemindersCronPattern,
  assetRemindersJobAttempts,
  assetRemindersJobBackoffMilliseconds,
  assetRemindersJobName,
  assetRemindersQueueName,
  assetRemindersSchedulerId,
} from './asset-reminders.constants';

/** Idempotent by scheduler id, so restarts and extra workers converge on one schedule. */
@Injectable()
export class AssetRemindersSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AssetRemindersSchedulerService.name);

  constructor(@InjectQueue(assetRemindersQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        assetRemindersSchedulerId,
        { pattern: assetRemindersCronPattern },
        {
          name: assetRemindersJobName,
          data: {},
          opts: {
            attempts: assetRemindersJobAttempts,
            backoff: { type: 'exponential', delay: assetRemindersJobBackoffMilliseconds },
            removeOnComplete: { count: 5 },
            removeOnFail: { count: 20 },
          },
        },
      );
    } catch (error) {
      this.logger.warn(`asset_reminders_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
