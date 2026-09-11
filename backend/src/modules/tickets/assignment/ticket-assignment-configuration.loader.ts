import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketAssignmentConfiguration } from './parse-ticket-assignment-configuration';
import type { TicketAssignmentConfiguration } from './assignment.types';

@Injectable()
export class TicketAssignmentConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketAssignmentConfiguration> {
    try {
      return parseTicketAssignmentConfiguration({
        groupInboxEnabled: await this.settingsService.getSetting(
          settingKeys.privateTicketGroupInboxEnabled,
        ),
        autoAssignEnabled: await this.settingsService.getSetting(
          settingKeys.privateTicketAutoAssignEnabled,
        ),
        autoAssignStrategy: await this.settingsService.getSetting(
          settingKeys.privateTicketAutoAssignStrategy,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('ASSIGNMENT_UNAVAILABLE');
    }
  }
}
