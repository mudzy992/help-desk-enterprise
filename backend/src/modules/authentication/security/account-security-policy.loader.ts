import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { localPasswordConstants } from '../is-valid-local-password';

export { type AccountSecurityPolicy, defaultAccountSecurityPolicy } from './account-security-policy';
import { type AccountSecurityPolicy, defaultAccountSecurityPolicy } from './account-security-policy';

@Injectable()
export class AccountSecurityPolicyLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<AccountSecurityPolicy> {
    const d = defaultAccountSecurityPolicy;
    const get = async <T>(key: string, fallback: T, guard: (value: unknown) => value is T): Promise<T> => {
      try {
        const value = await this.settingsService.getSetting(key as never);
        return guard(value) ? value : fallback;
      } catch {
        return fallback;
      }
    };
    const isBool = (value: unknown): value is boolean => typeof value === 'boolean';
    const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
    const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
    const [
      mfaRequiredForAdmins, mfaAllowOptional, mfaIssuerName, passwordMinLength, passwordBlocklistEnabled,
      passwordHistoryCount, passwordMaxAgeDays, superAdminPasswordMaxAgeDays, sessionsMaxPerUser, sessionsNewDeviceAlert,
    ] = await Promise.all([
      get(settingKeys.privateAuthMfaRequiredForAdmins, d.mfaRequiredForAdmins, isBool),
      get(settingKeys.privateAuthMfaAllowOptional, d.mfaAllowOptional, isBool),
      get(settingKeys.privateAuthMfaIssuerName, d.mfaIssuerName, isText),
      get(settingKeys.privateAuthPasswordMinLength, d.passwordMinLength, isInt),
      get(settingKeys.privateAuthPasswordBlocklistEnabled, d.passwordBlocklistEnabled, isBool),
      get(settingKeys.privateAuthPasswordHistoryCount, d.passwordHistoryCount, isInt),
      get(settingKeys.privateAuthPasswordMaxAgeDays, d.passwordMaxAgeDays, isInt),
      get(settingKeys.privateAuthPasswordSuperAdminMaxAgeDays, d.superAdminPasswordMaxAgeDays, isInt),
      get(settingKeys.privateAuthSessionsMaxPerUser, d.sessionsMaxPerUser, isInt),
      get(settingKeys.privateAuthSessionsNewDeviceAlert, d.sessionsNewDeviceAlert, isBool),
    ]);
    return {
      mfaRequiredForAdmins,
      mfaAllowOptional,
      mfaIssuerName: mfaIssuerName.trim(),
      passwordMinLength: Math.max(localPasswordConstants.minimumLength, passwordMinLength),
      passwordMaxLength: d.passwordMaxLength,
      passwordBlocklistEnabled,
      passwordHistoryCount,
      passwordMaxAgeDays,
      superAdminPasswordMaxAgeDays,
      sessionsMaxPerUser,
      sessionsNewDeviceAlert,
    };
  }
}
