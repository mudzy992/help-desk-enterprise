import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketSplitConfiguration } from './parse-ticket-split-configuration';
import type { TicketSplitConfiguration } from './split.types';

@Injectable()
export class TicketSplitConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketSplitConfiguration> {
    try {
      return parseTicketSplitConfiguration({
        addonEnabled: await this.settingsService.getSetting(
          settingKeys.privateAddonsTicketSplit,
        ),
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketSplitEnabled,
        ),
        allowAttachmentMove: await this.settingsService.getSetting(
          settingKeys.privateTicketSplitAllowAttachmentMove,
        ),
        allowMessageCopy: await this.settingsService.getSetting(
          settingKeys.privateTicketSplitAllowMessageCopy,
        ),
        requireReason: await this.settingsService.getSetting(
          settingKeys.privateTicketSplitRequireReason,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('SPLIT_UNAVAILABLE');
    }
  }
}
