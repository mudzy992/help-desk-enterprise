import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketForwardingConfiguration } from './parse-ticket-forwarding-configuration';
import type { TicketForwardingConfiguration } from './forwarding.types';

@Injectable()
export class TicketForwardingConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketForwardingConfiguration> {
    try {
      const [
        allowCrossOu,
        requireReason,
        keepPreviousHandlersAsWatchers,
        notifyRequester,
        minReasonLength,
      ] = await Promise.all([
        this.settingsService.getSetting(
          settingKeys.privateTicketForwardingAllowCrossOu,
        ),
        this.settingsService.getSetting(
          settingKeys.privateTicketForwardingRequireReason,
        ),
        this.settingsService.getSetting(
          settingKeys.privateTicketForwardingKeepPreviousHandlersAsWatchers,
        ),
        this.settingsService.getSetting(
          settingKeys.privateTicketForwardingNotifyRequester,
        ),
        this.settingsService.getSetting(
          settingKeys.privateTicketForwardingMinReasonLength,
        ),
      ]);
      return parseTicketForwardingConfiguration({
        allowCrossOu,
        requireReason,
        keepPreviousHandlersAsWatchers,
        notifyRequester,
        minReasonLength,
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('FORWARDING_UNAVAILABLE');
    }
  }
}
