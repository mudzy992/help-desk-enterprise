import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { parseServiceFormsConfiguration } from './parse-service-forms-configuration';
import { ServiceFormsError } from './service-forms.error';
import type { ServiceFormsConfiguration } from './service-forms.types';

@Injectable()
export class ServiceFormsConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<ServiceFormsConfiguration> {
    try {
      return parseServiceFormsConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketFormsEnabled,
        ),
        requireStructuredFields: await this.settingsService.getSetting(
          settingKeys.privateTicketFormsRequireStructuredFields,
        ),
        versioningEnabled: await this.settingsService.getSetting(
          settingKeys.privateTicketFormsVersioningEnabled,
        ),
        allowMultipleActiveVersions: await this.settingsService.getSetting(
          settingKeys.privateTicketFormsVersioningAllowMultipleActiveVersions,
        ),
        requireVersionOnTicket: await this.settingsService.getSetting(
          settingKeys.privateTicketFormsVersioningRequireVersionOnTicket,
        ),
      });
    } catch (error) {
      if (error instanceof ServiceFormsError) {
        throw error;
      }
      throw new ServiceFormsError('FORMS_UNAVAILABLE');
    }
  }
}
