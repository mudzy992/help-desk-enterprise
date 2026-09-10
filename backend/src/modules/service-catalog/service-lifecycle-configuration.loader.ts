import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { parseServiceLifecycleConfiguration } from './parse-service-lifecycle-configuration';
import { ServiceCatalogError } from './service-catalog.error';
import type { ServiceLifecycleConfiguration } from './service-catalog.types';

@Injectable()
export class ServiceLifecycleConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<ServiceLifecycleConfiguration> {
    try {
      return parseServiceLifecycleConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateServicesLifecycleEnabled,
        ),
        allowedStatesCsv: await this.settingsService.getSetting(
          settingKeys.privateServicesLifecycleAllowedStatesCsv,
        ),
        defaultStateOnCreate: await this.settingsService.getSetting(
          settingKeys.privateServicesLifecycleDefaultStateOnCreate,
        ),
      });
    } catch (error) {
      if (error instanceof ServiceCatalogError) {
        throw error;
      }
      throw new ServiceCatalogError('LIFECYCLE_UNAVAILABLE');
    }
  }
}
