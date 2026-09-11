import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SettingsModule } from '../settings/settings.module';
import { InstallController } from './install.controller';
import { InstallSetupGuard } from './install-setup.guard';
import { InstallSetupService } from './install-setup.service';

@Module({
  imports: [SettingsModule],
  controllers: [InstallController],
  providers: [
    InstallSetupService,
    InstallSetupGuard,
    {
      provide: APP_GUARD,
      useExisting: InstallSetupGuard,
    },
  ],
  exports: [InstallSetupService],
})
export class InstallModule {}
