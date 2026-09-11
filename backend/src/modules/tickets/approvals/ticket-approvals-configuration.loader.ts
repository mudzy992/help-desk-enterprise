import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketApprovalsConfiguration } from './parse-ticket-approvals-configuration';
import type { TicketApprovalsConfiguration } from './approvals.types';

@Injectable()
export class TicketApprovalsConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketApprovalsConfiguration> {
    try {
      return parseTicketApprovalsConfiguration({
        addonEnabled: await this.settingsService.getSetting(
          settingKeys.privateAddonsApprovals,
        ),
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketApprovalsEnabled,
        ),
        requiredByServiceJson:
          await this.settingsService.getSecretForInternalUse(
            settingKeys.privateTicketApprovalsRequiredByServiceJson,
          ),
        defaultApproverRole: await this.settingsService.getSetting(
          settingKeys.privateTicketApprovalsDefaultApproverRole,
        ),
        allowRequesterManager: await this.settingsService.getSetting(
          settingKeys.privateTicketApprovalsAllowRequesterManager,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('APPROVALS_UNAVAILABLE');
    }
  }
}
