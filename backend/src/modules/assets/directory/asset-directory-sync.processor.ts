import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { AssetError } from '../assets.constants';
import { assetDirectorySyncQueueName } from './asset-directory-sync.constants';
import { AssetDirectorySyncService } from './asset-directory-sync.service';

/** Paket 3.2 (§12): hourly tick; configuration problems are logged, not retried. */
@Processor(assetDirectorySyncQueueName)
export class AssetDirectorySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AssetDirectorySyncProcessor.name);

  constructor(private readonly sync: AssetDirectorySyncService) {
    super();
  }

  async process(): Promise<void> {
    try {
      await this.sync.runIfDue();
    } catch (error) {
      if (error instanceof AssetError) {
        this.logger.warn(`asset_directory_sync_skipped code=${error.code} detail=${error.detail ?? ''}`);
        return;
      }
      throw error;
    }
  }
}
