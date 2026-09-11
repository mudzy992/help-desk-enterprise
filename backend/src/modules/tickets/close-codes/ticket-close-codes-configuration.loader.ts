import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketCloseCodesConfiguration } from './parse-ticket-close-codes-configuration';
import type { TicketCloseCodesConfiguration } from './close-codes.types';

@Injectable()
export class TicketCloseCodesConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketCloseCodesConfiguration> {
    try {
      return parseTicketCloseCodesConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketCloseCodesEnabled,
        ),
        allowedCodesCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketCloseCodesAllowedCodesCsv,
        ),
        requireOnResolve: await this.settingsService.getSetting(
          settingKeys.privateTicketCloseCodesRequireOnResolve,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('CLOSE_CODES_UNAVAILABLE');
    }
  }
}
