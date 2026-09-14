import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { observabilityErrorCodes } from './observability.constants';
import { ObservabilityError } from './observability.error';
import { parseSupportBundleConfiguration } from './parse-support-bundle-configuration';
import type { SupportBundleConfiguration } from './observability.types';

@Injectable()
export class ObservabilityConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<SupportBundleConfiguration> {
    try {
      return parseSupportBundleConfiguration({
        auditRetentionDays: await this.settingsService.getSetting(
          settingKeys.privateObservabilityAuditRetentionDays,
        ),
        requestLogRetentionDays: await this.settingsService.getSetting(
          settingKeys.privateObservabilityRequestLogRetentionDays,
        ),
        supportBundleEnabled: await this.settingsService.getSetting(
          settingKeys.privateObservabilitySupportBundleEnabled,
        ),
        includeConfigSnapshot: await this.settingsService.getSetting(
          settingKeys.privateObservabilitySupportBundleIncludeConfigSnapshot,
        ),
        includeRecentLogs: await this.settingsService.getSetting(
          settingKeys.privateObservabilitySupportBundleIncludeRecentLogs,
        ),
        includeAuditExport: await this.settingsService.getSetting(
          settingKeys.privateObservabilitySupportBundleIncludeAuditExport,
        ),
        recentLogsMinutes: await this.settingsService.getSetting(
          settingKeys.privateObservabilitySupportBundleRecentLogsMinutes,
        ),
      });
    } catch (error) {
      if (error instanceof ObservabilityError) {
        throw error;
      }
      throw new ObservabilityError(observabilityErrorCodes.invalidConfiguration);
    }
  }
}
