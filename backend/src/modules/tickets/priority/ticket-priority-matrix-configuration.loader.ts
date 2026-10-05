import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';

export type TicketPriorityMatrixConfiguration = {
  readonly enabled: boolean;
};

export const defaultTicketPriorityMatrixConfiguration: TicketPriorityMatrixConfiguration =
  { enabled: true };

/**
 * M7 B5 (val 5): RAW asks for `enabled` over the impact/urgency matrix. A
 * missing or unreadable setting means "on", the same as a fresh installation.
 */
@Injectable()
export class TicketPriorityMatrixConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketPriorityMatrixConfiguration> {
    try {
      const value = await this.settingsService.getSetting(
        settingKeys.privateTicketPriorityMatrixEnabled,
      );
      return { enabled: value === false ? false : true };
    } catch {
      return defaultTicketPriorityMatrixConfiguration;
    }
  }
}
