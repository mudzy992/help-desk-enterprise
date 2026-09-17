import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { DirectoryReadCache } from './directory-read.cache';
import { DirectoryReadThrottle } from './directory-read.throttle';
import { DirectorySyncConfigurationLoader } from './directory-sync-configuration.loader';
import { DirectorySyncController } from './directory-sync.controller';
import { DirectorySyncService } from './directory-sync.service';
import { DIRECTORY_SYNC_CLOCK } from './directory-sync.tokens';
import { DirectorySyncProviderResolver } from './directory-sync-provider.resolver';
import { DirectorySyncStatusService } from './directory-sync-status.service';
import { DirectorySyncStatusStore } from './directory-sync-status.store';
import { ManualDirectoryCatalogController } from './manual-directory-catalog.controller';
import { ManualDirectoryCatalogService } from './manual-directory-catalog.service';
import { ManualOnlyDirectorySyncProvider } from './manual-only-directory-sync.provider';

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    AuthenticationModule,
    AuthorizationModule,
  ],
  controllers: [DirectorySyncController, ManualDirectoryCatalogController],
  providers: [
    {
      provide: DIRECTORY_SYNC_CLOCK,
      useValue: () => Date.now(),
    },
    DirectorySyncConfigurationLoader,
    ManualOnlyDirectorySyncProvider,
    DirectorySyncProviderResolver,
    {
      provide: DirectoryReadCache,
      useFactory: () => new DirectoryReadCache(),
    },
    DirectoryReadThrottle,
    DirectorySyncStatusStore,
    DirectorySyncStatusService,
    ManualDirectoryCatalogService,
    DirectorySyncService,
  ],
  exports: [DirectorySyncService],
})
export class DirectorySyncModule {}
