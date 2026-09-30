import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  assetDirectorySyncCronPattern,
  assetDirectorySyncJobAttempts,
  assetDirectorySyncJobName,
  assetDirectorySyncQueueName,
  assetDirectorySyncSchedulerId,
} from './asset-directory-sync.constants';

/** Idempotent by scheduler id, so restarts and extra workers converge on one schedule. */
@Injectable()
export class AssetDirectorySyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AssetDirectorySyncSchedulerService.name);

  constructor(@InjectQueue(assetDirectorySyncQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        assetDirectorySyncSchedulerId,
        { pattern: assetDirectorySyncCronPattern },
        {
          name: assetDirectorySyncJobName,
          data: {},
          opts: { attempts: assetDirectorySyncJobAttempts, removeOnComplete: { count: 5 }, removeOnFail: { count: 20 } },
        },
      );
    } catch (error) {
      this.logger.warn(`asset_directory_sync_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
