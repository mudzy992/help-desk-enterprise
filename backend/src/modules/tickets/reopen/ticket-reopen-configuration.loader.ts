import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketReopenConfiguration } from './parse-ticket-reopen-configuration';
import type { TicketReopenConfiguration } from './reopen.types';

@Injectable()
export class TicketReopenConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketReopenConfiguration> {
    try {
      return parseTicketReopenConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketReopenEnabled,
        ),
        windowDays: await this.settingsService.getSetting(
          settingKeys.privateTicketReopenWindowDays,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('REOPEN_UNAVAILABLE');
    }
  }
}
