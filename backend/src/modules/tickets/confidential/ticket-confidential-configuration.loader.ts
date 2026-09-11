import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketConfidentialConfiguration } from './parse-ticket-confidential-configuration';
import type { TicketConfidentialConfiguration } from './confidential.types';

@Injectable()
export class TicketConfidentialConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketConfidentialConfiguration> {
    try {
      return parseTicketConfidentialConfiguration({
        addonEnabled: await this.settingsService.getSetting(
          settingKeys.privateAddonsConfidential,
        ),
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketConfidentialEnabled,
        ),
        defaultForServicesCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketConfidentialDefaultForServicesCsv,
        ),
        allowedViewerRolesCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketConfidentialAllowedViewerRolesCsv,
        ),
        allowedViewerGroupIdsCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketConfidentialAllowedViewerGroupIdsCsv,
        ),
        breakGlassEnabled: await this.settingsService.getSetting(
          settingKeys.privateTicketConfidentialBreakGlassEnabled,
        ),
        breakGlassAllowedRolesCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketConfidentialBreakGlassAllowedRolesCsv,
        ),
        breakGlassRequiresReason: await this.settingsService.getSetting(
          settingKeys.privateTicketConfidentialBreakGlassRequiresReason,
        ),
        auditViews: await this.settingsService.getSetting(
          settingKeys.privateTicketConfidentialAuditViews,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('CONFIDENTIAL_UNAVAILABLE');
    }
  }
}
