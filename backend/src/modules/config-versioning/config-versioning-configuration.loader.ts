import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import {
  configVersioningErrorCodes,
} from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import { parseConfigVersioningConfiguration } from './parse-config-versioning-configuration';
import type { ConfigVersioningConfiguration } from './config-versioning.types';

@Injectable()
export class ConfigVersioningConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<ConfigVersioningConfiguration> {
    try {
      return parseConfigVersioningConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateConfigVersioningEnabled,
        ),
        allowRollback: await this.settingsService.getSetting(
          settingKeys.privateConfigVersioningAllowRollback,
        ),
        validationEnabled: await this.settingsService.getSetting(
          settingKeys.privateConfigVersioningValidationEnabled,
        ),
        blockActivationOnError: await this.settingsService.getSetting(
          settingKeys.privateConfigVersioningValidationBlockActivationOnError,
        ),
        shadowModeEnabled: await this.settingsService.getSetting(
          settingKeys.privateConfigVersioningShadowModeEnabled,
        ),
        scopesCsv: await this.settingsService.getSetting(
          settingKeys.privateConfigVersioningScopesCsv,
        ),
      });
    } catch (error) {
      if (error instanceof ConfigVersioningError) {
        throw error;
      }
      throw new ConfigVersioningError(configVersioningErrorCodes.disabled);
    }
  }
}
