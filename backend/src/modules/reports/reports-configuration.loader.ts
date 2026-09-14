import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { reportErrorCodes } from './reports.constants';
import { ReportsError } from './reports.error';
import { parseReportsConfiguration } from './parse-reports-configuration';
import type { ReportsConfiguration } from './reports.types';

@Injectable()
export class ReportsConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<ReportsConfiguration> {
    try {
      return parseReportsConfiguration({
        reportsEnabled: await this.settingsService.getSetting(
          settingKeys.privateReportsEnabled,
        ),
        addonEnabled: await this.settingsService.getSetting(
          settingKeys.privateAddonsReports,
        ),
        packsJson: await this.settingsService.getSecretForInternalUse(
          settingKeys.privateReportsPacksJson,
        ),
        allowedFormatsCsv: await this.settingsService.getSetting(
          settingKeys.privateReportsExportFormatsCsv,
        ),
        bottlenecksEnabled: await this.settingsService.getSetting(
          settingKeys.privateDashboardBottlenecksEnabled,
        ),
        defaultWindowDays: await this.settingsService.getSetting(
          settingKeys.privateDashboardBottlenecksDefaultWindowDays,
        ),
      });
    } catch (error) {
      if (error instanceof ReportsError) {
        throw error;
      }
      throw new ReportsError(reportErrorCodes.disabled);
    }
  }
}
