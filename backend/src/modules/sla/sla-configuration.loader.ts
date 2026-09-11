import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { SlaError } from './sla.error';
import type { SlaConfiguration } from './sla.types';

@Injectable()
export class SlaConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<SlaConfiguration> {
    try {
      const [requireReason, allowServiceOverrides, allowOuOverrides] =
        await Promise.all([
          this.settingsService.getSetting(
            settingKeys.privateTicketSlaRequireAdminReasonForRuleChanges,
          ),
          this.settingsService.getSetting(
            settingKeys.privateTicketSlaAllowServiceOverrides,
          ),
          this.settingsService.getSetting(
            settingKeys.privateTicketSlaAllowOuOverrides,
          ),
        ]);
      return {
        requireReason: requireReason === true,
        allowServiceOverrides: allowServiceOverrides === true,
        allowOuOverrides: allowOuOverrides === true,
      };
    } catch (error) {
      if (error instanceof SlaError) {
        throw error;
      }
      throw new SlaError('UNAVAILABLE');
    }
  }
}
