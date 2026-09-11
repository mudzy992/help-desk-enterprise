import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketSafeLoggingConfiguration } from './parse-ticket-safe-logging-configuration';
import type { TicketSafeLoggingConfiguration } from './safe-logging.types';

@Injectable()
export class TicketSafeLoggingConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketSafeLoggingConfiguration> {
    try {
      return parseTicketSafeLoggingConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateSecuritySafeLoggingEnabled,
        ),
        levelsCsv: await this.settingsService.getSetting(
          settingKeys.privateSecuritySafeLoggingLevelsCsv,
        ),
        redactFieldsCsv: await this.settingsService.getSetting(
          settingKeys.privateSecuritySafeLoggingRedactFieldsCsv,
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
