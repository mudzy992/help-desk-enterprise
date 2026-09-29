import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { AssetAccessService } from './asset-access.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

/** Paket 3.2: CMDB (behind the private.addons.cmdb addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule],
  controllers: [AssetsController],
  providers: [AssetAccessService, AssetCatalogService, AssetsService],
  exports: [AssetAccessService, AssetsService],
})
export class AssetsModule {}
