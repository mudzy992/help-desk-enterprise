import { Module } from '@nestjs/common';
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
import { ManualOnlyDirectorySyncProvider } from './manual-only-directory-sync.provider';

@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule],
  controllers: [DirectorySyncController],
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
    DirectorySyncService,
  ],
})
export class DirectorySyncModule {}
