import { Module } from '@nestjs/common';
import { foundationalSettings } from './definitions/foundational-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';

@Module({
  providers: [
    {
      provide: SETTINGS_REGISTRY,
      useFactory: () => createSettingsRegistry(foundationalSettings),
    },
    SettingsService,
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
