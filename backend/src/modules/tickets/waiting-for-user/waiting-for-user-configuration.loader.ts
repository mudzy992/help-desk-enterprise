import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseWaitingForUserConfiguration } from './parse-waiting-for-user-configuration';
import type { WaitingForUserConfiguration } from './waiting-for-user.types';

@Injectable()
export class WaitingForUserConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<WaitingForUserConfiguration> {
    try {
      return parseWaitingForUserConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketWaitingForUserEnabled,
        ),
        reminderAfterDays: await this.settingsService.getSetting(
          settingKeys.privateTicketWaitingForUserReminderAfterDays,
        ),
        autoCloseAfterDays: await this.settingsService.getSetting(
          settingKeys.privateTicketWaitingForUserAutoCloseAfterDays,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('WAITING_FOR_USER_UNAVAILABLE');
    }
  }
}
