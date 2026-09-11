import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketBulkConfiguration } from './parse-ticket-bulk-configuration';
import type { TicketBulkConfiguration } from './bulk.types';

@Injectable()
export class TicketBulkConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketBulkConfiguration> {
    try {
      return parseTicketBulkConfiguration({
        addonEnabled: await this.settingsService.getSetting(
          settingKeys.privateAddonsBulkActions,
        ),
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsEnabled,
        ),
        allowCrossOuForSuperAdmin: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsAllowCrossOuForSuperAdmin,
        ),
        requireSameOuAndGroup: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsRequireSameOuAndGroup,
        ),
        disallowBulkClose: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsDisallowBulkClose,
        ),
        allowedActionTypesCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsAllowedActionTypesCsv,
        ),
        broadcastEnableInApp: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsBroadcastEnableInApp,
        ),
        broadcastEnableEmail: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsBroadcastEnableEmail,
        ),
        broadcastRequirePreview: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsBroadcastRequirePreview,
        ),
        broadcastRateLimitPerMinute: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsBroadcastRateLimitPerMinute,
        ),
        broadcastStructuredEnabled: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsBroadcastStructuredEnabled,
        ),
        broadcastRequiredFieldsCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsBroadcastRequiredFieldsCsv,
        ),
        broadcastAllowWorkaround: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsBroadcastAllowWorkaround,
        ),
        broadcastAllowLinks: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsBroadcastAllowLinks,
        ),
        auditBatchIdEnabled: await this.settingsService.getSetting(
          settingKeys.privateTicketBulkActionsAuditBatchIdEnabled,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('BULK_UNAVAILABLE');
    }
  }
}
