import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketSavedViewsConfiguration } from './parse-ticket-saved-views-configuration';
import type { TicketSavedViewsConfiguration } from './saved-views.types';

@Injectable()
export class TicketSavedViewsConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketSavedViewsConfiguration> {
    try {
      return parseTicketSavedViewsConfiguration({
        addonEnabled: await this.settingsService.getSetting(
          settingKeys.privateAddonsSavedViews,
        ),
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketSavedViewsEnabled,
        ),
        maxPerUser: await this.settingsService.getSetting(
          settingKeys.privateTicketSavedViewsMaxPerUser,
        ),
        allowDefaultView: await this.settingsService.getSetting(
          settingKeys.privateTicketSavedViewsAllowDefaultView,
        ),
        allowSharing: await this.settingsService.getSetting(
          settingKeys.privateTicketSavedViewsAllowSharing,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('SAVED_VIEWS_UNAVAILABLE');
    }
  }
}
