import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketGuardrailsConfiguration } from './parse-ticket-guardrails-configuration';
import type { TicketGuardrailsConfiguration } from './guardrails.types';

@Injectable()
export class TicketGuardrailsConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketGuardrailsConfiguration> {
    try {
      return parseTicketGuardrailsConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateGuardrailsAntiLoopEnabled,
        ),
        duplicateWindowMinutes: await this.settingsService.getSetting(
          settingKeys.privateGuardrailsAntiLoopDuplicateWindowMinutes,
        ),
        similarityThreshold: await this.settingsService.getSetting(
          settingKeys.privateGuardrailsAntiLoopSimilarityThreshold,
        ),
        mode: await this.settingsService.getSetting(
          settingKeys.privateGuardrailsAntiLoopMode,
        ),
        confirmAboveRecipients: await this.settingsService.getSetting(
          settingKeys.privateGuardrailsBulkBroadcastConfirmAboveRecipients,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('GUARDRAILS_UNAVAILABLE');
    }
  }
}
