import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DirectoryBackoff } from '../../directory-sync/ldaps/directory-backoff';
import { LdapsSyncConfigurationLoader } from '../../directory-sync/ldaps/ldaps-sync-configuration.loader';
import { SettingsModule } from '../../settings/settings.module';
import { AssetAccessService } from '../asset-access.service';
import { assetDirectorySyncQueueName } from './asset-directory-sync.constants';
import { AssetDirectorySyncProcessor } from './asset-directory-sync.processor';
import { AssetDirectorySyncSchedulerService } from './asset-directory-sync.scheduler.service';
import { AssetDirectorySyncService } from './asset-directory-sync.service';

/** Paket 3.2 (§12): scheduled AD computer sync, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: assetDirectorySyncQueueName }), SettingsModule],
  providers: [
    AssetAccessService,
    LdapsSyncConfigurationLoader,
    DirectoryBackoff,
    AssetDirectorySyncService,
    AssetDirectorySyncProcessor,
    AssetDirectorySyncSchedulerService,
  ],
})
export class AssetDirectorySyncWorkerModule {}
