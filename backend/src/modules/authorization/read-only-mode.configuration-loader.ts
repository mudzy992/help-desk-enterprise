import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import {
  parseReadOnlyModeConfiguration,
  ReadOnlyModeConfigurationError,
} from './parse-read-only-mode-configuration';
import type { ReadOnlyModeConfiguration } from './read-only-mode.types';

@Injectable()
export class ReadOnlyModeConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<ReadOnlyModeConfiguration> {
    try {
      return parseReadOnlyModeConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateReadOnlyModeEnabled,
        ),
        modulesCsv: await this.settingsService.getSetting(
          settingKeys.privateReadOnlyModeModulesCsv,
        ),
        activeModulesCsv: await this.settingsService.getSetting(
          settingKeys.privateReadOnlyModeActiveModulesCsv,
        ),
        bypassRolesCsv: await this.settingsService.getSetting(
          settingKeys.privateReadOnlyModeBypassRolesCsv,
        ),
      });
    } catch (error) {
      if (error instanceof ReadOnlyModeConfigurationError) {
        throw error;
      }
      throw new ReadOnlyModeConfigurationError();
    }
  }
}
