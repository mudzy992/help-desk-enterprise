import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { parseServiceAvailabilityConfigurationBundle } from './parse-service-availability-configuration';
import { ServiceCatalogError } from './service-catalog.error';
import type { ServiceAvailabilityConfigurationBundle } from './service-availability.types';

@Injectable()
export class ServiceAvailabilityConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<ServiceAvailabilityConfigurationBundle> {
    try {
      return parseServiceAvailabilityConfigurationBundle({
        availabilityEnabled: await this.settingsService.getSetting(
          settingKeys.privateServicesAvailabilityEnabled,
        ),
        allowedStatusesCsv: await this.settingsService.getSetting(
          settingKeys.privateServicesAvailabilityAllowedStatusesCsv,
        ),
        showStatusInCatalog: await this.settingsService.getSetting(
          settingKeys.privateServicesAvailabilityShowStatusInCatalog,
        ),
        showStatusInTicketCreate: await this.settingsService.getSetting(
          settingKeys.privateServicesAvailabilityShowStatusInTicketCreate,
        ),
        changeRequiresReason: await this.settingsService.getSetting(
          settingKeys.privateServicesAvailabilityChangeRequiresReason,
        ),
        downtimeEnabled: await this.settingsService.getSetting(
          settingKeys.privateServicesDowntimeSchedulingEnabled,
        ),
        autoSetMaintenanceStatus: await this.settingsService.getSetting(
          settingKeys.privateServicesDowntimeSchedulingAutoSetMaintenanceStatus,
        ),
        autoRestoreOperational: await this.settingsService.getSetting(
          settingKeys.privateServicesDowntimeSchedulingAutoRestoreOperational,
        ),
        requireReason: await this.settingsService.getSetting(
          settingKeys.privateServicesDowntimeSchedulingRequireReason,
        ),
      });
    } catch (error) {
      if (error instanceof ServiceCatalogError) {
        throw error;
      }
      throw new ServiceCatalogError('AVAILABILITY_UNAVAILABLE');
    }
  }
}
