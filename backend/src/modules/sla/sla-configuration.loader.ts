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
        maxEscalationLevels,
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
        this.settingsService.getSetting(
          settingKeys.privateTicketSlaMaxEscalationLevels,
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
        maxEscalationLevels: normalizeMaxEscalationLevels(maxEscalationLevels),
      };
    } catch (error) {
      if (error instanceof SlaError) {
        throw error;
      }
      throw new SlaError('UNAVAILABLE');
    }
  }
}

function normalizeMaxEscalationLevels(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return 3;
  }
  return Math.floor(value);
}
