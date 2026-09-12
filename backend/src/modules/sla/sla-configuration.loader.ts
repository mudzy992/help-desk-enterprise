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
      const [
        enabled,
        requireReason,
        allowServiceOverrides,
        allowOuOverrides,
        pauseOnWaitingForUser,
        pauseOnPendingApproval,
        escalationsEnabled,
      ] = await Promise.all([
        this.settingsService.getSetting(settingKeys.privateTicketSlaEnabled),
        this.settingsService.getSetting(
          settingKeys.privateTicketSlaRequireAdminReasonForRuleChanges,
        ),
        this.settingsService.getSetting(
          settingKeys.privateTicketSlaAllowServiceOverrides,
        ),
        this.settingsService.getSetting(
          settingKeys.privateTicketSlaAllowOuOverrides,
        ),
        this.settingsService.getSetting(
          settingKeys.privateTicketSlaPauseOnWaitingForUser,
        ),
        this.settingsService.getSetting(
          settingKeys.privateTicketSlaPauseOnPendingApproval,
        ),
        this.settingsService.getSetting(
          settingKeys.privateTicketSlaEscalationsEnabled,
        ),
      ]);
      return {
        enabled: enabled === true,
        requireReason: requireReason === true,
        allowServiceOverrides: allowServiceOverrides === true,
        allowOuOverrides: allowOuOverrides === true,
        pauseOnWaitingForUser: pauseOnWaitingForUser === true,
        pauseOnPendingApproval: pauseOnPendingApproval === true,
        escalationsEnabled: escalationsEnabled === true,
      };
    } catch (error) {
      if (error instanceof SlaError) {
        throw error;
      }
      throw new SlaError('UNAVAILABLE');
    }
  }
}
