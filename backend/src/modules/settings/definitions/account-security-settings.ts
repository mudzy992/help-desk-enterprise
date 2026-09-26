import { definePrivateSetting } from '../registry/define-setting';
import { SettingsError } from '../settings.error';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition, SettingValue } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

/** Paket 2.1 (M9): defaults and ranges of the account security policy. */
export const accountSecuritySettingRanges = {
  passwordMinLength: { min: 12, max: 64, default: 12 },
  passwordHistoryCount: { min: 0, max: 24, default: 5 },
  passwordMaxAgeDays: { min: 0, max: 3650, default: 0 },
  superAdminPasswordMaxAgeDays: { min: 0, max: 3650, default: 365 },
  sessionsMaxPerUser: { min: 0, max: 100, default: 0 },
} as const;

function integerInRange(label: string, range: { min: number; max: number }) {
  return (value: SettingValue): void => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < range.min || value > range.max) {
      throw new SettingsError(`${label} must be an integer between ${range.min} and ${range.max}`);
    }
  };
}

const r = accountSecuritySettingRanges;
const category = settingCategoryIds.privateAuth;

export const accountSecuritySettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateAuthMfaRequiredForAdmins,
    categoryId: category,
    valueType: 'boolean',
    description: 'Require TOTP MFA for ADMIN accounts with a local password (SUPER_ADMIN always requires it)',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthMfaAllowOptional,
    categoryId: category,
    valueType: 'boolean',
    description: 'Let other local accounts turn on TOTP MFA themselves',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthMfaIssuerName,
    categoryId: category,
    valueType: 'string',
    description: 'Name shown in the authenticator app',
    isRequired: true,
    defaultValue: 'EP HelpDesk',
    assertValue: (value) => {
      if (typeof value !== 'string' || value.trim().length === 0 || value.length > 40 || value.includes(':')) {
        throw new SettingsError('Issuer name must be 1-40 characters without ":"');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthPasswordMinLength,
    categoryId: category,
    valueType: 'number',
    description: 'Minimum length of local passwords (12-64)',
    isRequired: true,
    defaultValue: r.passwordMinLength.default,
    assertValue: integerInRange('Password minimum length', r.passwordMinLength),
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthPasswordBlocklistEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Reject common and leaked passwords (offline list) and organisation words',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthPasswordHistoryCount,
    categoryId: category,
    valueType: 'number',
    description: 'How many previous passwords may not be reused (0-24)',
    isRequired: true,
    defaultValue: r.passwordHistoryCount.default,
    assertValue: integerInRange('Password history count', r.passwordHistoryCount),
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthPasswordMaxAgeDays,
    categoryId: category,
    valueType: 'number',
    description: 'Password expiry in days for local accounts other than SUPER_ADMIN; 0 = never',
    isRequired: true,
    defaultValue: r.passwordMaxAgeDays.default,
    assertValue: integerInRange('Password max age', r.passwordMaxAgeDays),
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthPasswordSuperAdminMaxAgeDays,
    categoryId: category,
    valueType: 'number',
    description: 'Password expiry in days for SUPER_ADMIN (break-glass); 0 = never',
    isRequired: true,
    defaultValue: r.superAdminPasswordMaxAgeDays.default,
    assertValue: integerInRange('SUPER_ADMIN password max age', r.superAdminPasswordMaxAgeDays),
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthSessionsMaxPerUser,
    categoryId: category,
    valueType: 'number',
    description: 'Maximum parallel sessions per user; a new sign-in ends the oldest. 0 = no limit',
    isRequired: true,
    defaultValue: r.sessionsMaxPerUser.default,
    assertValue: integerInRange('Sessions per user', r.sessionsMaxPerUser),
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthSessionsNewDeviceAlert,
    categoryId: category,
    valueType: 'boolean',
    description: 'Notify ADMIN and SUPER_ADMIN accounts about a sign-in from a new device',
    isRequired: true,
    defaultValue: true,
  }),
];
