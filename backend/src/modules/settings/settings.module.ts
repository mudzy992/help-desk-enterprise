import { Module } from '@nestjs/common';
import { applicationSettings } from './definitions/application-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';

@Module({
  providers: [
    {
      provide: SETTINGS_REGISTRY,
      useFactory: () => createSettingsRegistry(applicationSettings),
    },
    SettingsService,
  ],
  exports: [SettingsService, SETTINGS_REGISTRY],
})
export class SettingsModule {}
