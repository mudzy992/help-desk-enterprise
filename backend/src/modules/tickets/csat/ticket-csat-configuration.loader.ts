import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { TicketsError } from '../tickets.error';
import { parseTicketCsatConfiguration } from './parse-ticket-csat-configuration';
import type { TicketCsatConfiguration } from './csat.types';

@Injectable()
export class TicketCsatConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<TicketCsatConfiguration> {
    try {
      return parseTicketCsatConfiguration({
        addonEnabled: await this.settingsService.getSetting(
          settingKeys.privateAddonsCsat,
        ),
        enabled: await this.settingsService.getSetting(
          settingKeys.privateCsatEnabled,
        ),
        scaleMax: await this.settingsService.getSetting(
          settingKeys.privateCsatScaleMax,
        ),
        askOnResolved: await this.settingsService.getSetting(
          settingKeys.privateCsatAskOnResolved,
        ),
        askOnClosed: await this.settingsService.getSetting(
          settingKeys.privateCsatAskOnClosed,
        ),
        samplingRate: await this.settingsService.getSetting(
          settingKeys.privateCsatSamplingRate,
        ),
      });
    } catch (error) {
      if (error instanceof TicketsError) {
        throw error;
      }
      throw new TicketsError('CSAT_UNAVAILABLE');
    }
  }
}
