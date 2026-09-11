import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { defaultTicketAttachmentConfiguration } from './attachments.constants';
import type { TicketAttachmentConfiguration } from './attachments.types';
import { parseTicketAttachmentConfiguration } from './parse-ticket-attachment-configuration';

@Injectable()
export class TicketAttachmentConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketAttachmentConfiguration> {
    try {
      return parseTicketAttachmentConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateTicketAttachmentsEnabled,
        ),
        maxFileSizeMb: await this.settingsService.getSetting(
          settingKeys.privateTicketAttachmentsMaxFileSizeMb,
        ),
        allowedMimeTypesCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketAttachmentsAllowedMimeTypesCsv,
        ),
        allowedExtensionsCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketAttachmentsAllowedExtensionsCsv,
        ),
        maxFilesPerTicket: await this.settingsService.getSetting(
          settingKeys.privateTicketAttachmentsMaxFilesPerTicket,
        ),
        maxFilesPerMessage: await this.settingsService.getSetting(
          settingKeys.privateTicketAttachmentsMaxFilesPerMessage,
        ),
        dangerousExtensionsCsv: await this.settingsService.getSetting(
          settingKeys.privateTicketAttachmentsDangerousExtensionsBlocklistCsv,
        ),
        retentionDays: await this.settingsService.getSetting(
          settingKeys.privateTicketAttachmentsRetentionDays,
        ),
      });
    } catch {
      return { ...defaultTicketAttachmentConfiguration };
    }
  }
}
