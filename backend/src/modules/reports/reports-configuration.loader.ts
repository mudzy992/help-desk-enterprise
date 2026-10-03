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
        packWindowDays: await this.settingsService
          .getSetting(settingKeys.privateReportsDefaultWindowDays)
          .catch(() => undefined),
        csatScaleMax: await this.settingsService
          .getSetting(settingKeys.privateCsatScaleMax)
          .catch(() => undefined),
        pingPongThreshold: await this.settingsService
          .getSetting(settingKeys.privateReportsPingPongThreshold)
          .catch(() => undefined),
        cmdbEnabled: await this.settingsService
          .getSetting(settingKeys.privateAddonsCmdb)
          .catch(() => false),
        problemsEnabled: await this.settingsService
          .getSetting(settingKeys.privateAddonsProblems)
          .catch(() => false),
        changesEnabled: await this.settingsService
          .getSetting(settingKeys.privateAddonsChanges)
          .catch(() => false),
      });
    } catch (error) {
      if (error instanceof ReportsError) {
        throw error;
      }
      throw new ReportsError(reportErrorCodes.disabled);
    }
  }
}
