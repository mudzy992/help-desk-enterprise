import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { auditLogErrorCodes } from './audit-log.constants';
import { AuditLogError } from './audit-log.error';
import { parseAuditLogConfiguration } from './parse-audit-log-configuration';
import type { AuditLogConfiguration } from './audit-log.types';

@Injectable()
export class AuditLogConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<AuditLogConfiguration> {
    try {
      return parseAuditLogConfiguration({
        exportEnabled: await this.settingsService.getSetting(
          settingKeys.privateAuditExportEnabled,
        ),
        allowedFormatsCsv: await this.settingsService.getSetting(
          settingKeys.privateAuditExportAllowedFormatsCsv,
        ),
        tamperEvidentEnabled: await this.settingsService.getSetting(
          settingKeys.privateAuditTamperEvidentEnabled,
        ),
        hashAlgorithm: await this.settingsService.getSetting(
          settingKeys.privateAuditTamperEvidentHashAlgorithm,
        ),
      });
    } catch (error) {
      if (error instanceof AuditLogError) {
        throw error;
      }
      throw new AuditLogError(auditLogErrorCodes.exportDisabled);
    }
  }
}
