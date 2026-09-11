import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RoutingModule } from '../routing/routing.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { SettingsModule } from '../settings/settings.module';
import { InstallAddonsService } from './install-addons.service';
import { InstallController } from './install.controller';
import { InstallLoginProviderService } from './install-login-provider.service';
import { InstallSeedService } from './install-seed.service';
import { InstallSetupGuard } from './install-setup.guard';
import { InstallSetupService } from './install-setup.service';
import { InstallSmtpService } from './install-smtp.service';
import { InstallSuperAdminService } from './install-super-admin.service';

@Module({
  imports: [SettingsModule, ServiceCatalogModule, RoutingModule],
  controllers: [InstallController],
  providers: [
    InstallSetupService,
    InstallSuperAdminService,
    InstallLoginProviderService,
    InstallSmtpService,
    InstallSeedService,
    InstallAddonsService,
    InstallSetupGuard,
    {
      provide: APP_GUARD,
      useExisting: InstallSetupGuard,
    },
  ],
  exports: [InstallSetupService],
})
export class InstallModule {}
