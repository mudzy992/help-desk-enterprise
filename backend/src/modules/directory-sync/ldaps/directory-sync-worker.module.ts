import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrincipalContextInvalidator } from '../../../common/principal-context/principal-context-invalidator.service';
import { SessionRevocationStore } from '../../authentication/session-revocation.store';
import { SettingsModule } from '../../settings/settings.module';
import { DirectoryBackoff } from './directory-backoff';
import { DirectoryFullSyncService } from './directory-full-sync.service';
import { directorySyncQueueName } from './directory-sync.job.constants';
import { DirectorySyncProcessor } from './directory-sync.processor';
import { DirectorySyncSchedulerService } from './directory-sync.scheduler.service';
import { LdapsSyncConfigurationLoader } from './ldaps-sync-configuration.loader';

/** Paket 1.8 (A4): scheduled LDAPS directory sync, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: directorySyncQueueName }), SettingsModule],
  providers: [
    LdapsSyncConfigurationLoader,
    DirectoryBackoff,
    PrincipalContextInvalidator,
    SessionRevocationStore,
    DirectoryFullSyncService,
    DirectorySyncProcessor,
    DirectorySyncSchedulerService,
  ],
})
export class DirectorySyncWorkerModule {}
