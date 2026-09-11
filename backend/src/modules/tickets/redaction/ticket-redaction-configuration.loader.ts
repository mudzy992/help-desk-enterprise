import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketRedactionConfiguration } from './parse-ticket-redaction-configuration';
import type { TicketRedactionConfiguration } from './redaction.types';

@Injectable()
export class TicketRedactionConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketRedactionConfiguration> {
    try {
      return parseTicketRedactionConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateSecurityRedactionEnabled,
        ),
        mode: await this.settingsService.getSetting(
          settingKeys.privateSecurityRedactionMode,
        ),
        applyToFieldsCsv: await this.settingsService.getSetting(
          settingKeys.privateSecurityRedactionApplyToFieldsCsv,
        ),
        patternsJson: await this.settingsService.getSecretForInternalUse(
          settingKeys.privateSecurityRedactionPatternsJson,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('REDACTION_UNAVAILABLE');
    }
  }
}
