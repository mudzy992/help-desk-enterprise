import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AssetTicketsService } from './asset-tickets.service';
import { AssetContractsService } from './asset-contracts.service';
import { AssetLicensesService } from './asset-licenses.service';
import { AssetAccessService } from './asset-access.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetImportService } from './import/asset-import.service';
import { AssetDirectorySyncService } from './directory/asset-directory-sync.service';
import { DirectoryBackoff } from '../directory-sync/ldaps/directory-backoff';
import { LdapsSyncConfigurationLoader } from '../directory-sync/ldaps/ldaps-sync-configuration.loader';

/** Paket 3.2: CMDB (behind the private.addons.cmdb addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule, TicketsModule],
  controllers: [AssetsController],
  providers: [AssetAccessService, AssetCatalogService, AssetsService, AssetTicketsService, AssetLicensesService, AssetContractsService, AssetImportService,
    LdapsSyncConfigurationLoader, DirectoryBackoff, AssetDirectorySyncService],
  exports: [AssetAccessService, AssetsService, AssetImportService],
})
export class AssetsModule {}
