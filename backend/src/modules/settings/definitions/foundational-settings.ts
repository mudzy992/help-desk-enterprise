import {
  definePrivateSetting,
  definePublicSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';
import { SettingsError } from '../settings.error';
import { brandingLimits, defaultAppName } from '../../branding/branding.constants';
import { LogoValidationError, validateLogoDataUrl } from '../../branding/validate-logo-data-url';

function textUpTo(label: string, maxLength: number, required: boolean) {
  return (value: unknown): void => {
    if (typeof value !== 'string') throw new SettingsError(`${label} must be text`);
    if (value !== value.trim()) throw new SettingsError(`${label} must not start or end with spaces`);
    if (required && value.length === 0) throw new SettingsError(`${label} is required`);
    if (value.length > maxLength) throw new SettingsError(`${label} must be at most ${maxLength} characters`);
  };
}

export const foundationalSettings: readonly SettingDefinition[] = [
  definePublicSetting({
    key: settingKeys.publicBrandingAppName,
    categoryId: settingCategoryIds.publicBranding,
    valueType: 'string',
    description: 'Product name shown in the header, browser tab, e-mails, Teams and the authenticator app',
    isRequired: true,
    defaultValue: defaultAppName,
    assertValue: textUpTo('Application name', brandingLimits.appNameMaxLength, true),
  }),
  definePublicSetting({
    key: settingKeys.publicBrandingTagline,
    categoryId: settingCategoryIds.publicBranding,
    valueType: 'string',
    description: 'Short line under the product name on the sign-in page',
    isRequired: false,
    defaultValue: '',
    assertValue: textUpTo('Tagline', brandingLimits.taglineMaxLength, false),
  }),
  definePublicSetting({
    key: settingKeys.publicBrandingOrganizationName,
    categoryId: settingCategoryIds.publicBranding,
    valueType: 'string',
    description: 'Organisation operating this service desk (privacy notice, e-mail footer, reports)',
    isRequired: false,
    defaultValue: '',
    assertValue: textUpTo('Organisation name', brandingLimits.organizationNameMaxLength, false),
  }),
  definePublicSetting({
    key: settingKeys.publicBrandingLogoDataUrl,
    categoryId: settingCategoryIds.publicBranding,
    valueType: 'string',
    description: 'Logo as a PNG, JPEG or WebP data URL (max 200 KB, 1024 px); empty uses the built-in mark',
    isRequired: false,
    defaultValue: '',
    assertValue: (value) => {
      if (typeof value !== 'string') throw new SettingsError('Logo must be text');
      if (value.length === 0) return;
      try {
        validateLogoDataUrl(value);
      } catch (error) {
        throw new SettingsError(error instanceof LogoValidationError ? error.message : 'Logo is invalid');
      }
    },
  }),
  definePublicSetting({
    key: settingKeys.publicBrandingSupportEmail,
    categoryId: settingCategoryIds.publicBranding,
    valueType: 'string',
    description: 'Support contact e-mail shown on the sign-in page and in e-mail footers',
    isRequired: false,
    defaultValue: '',
    assertValue: (value) => {
      textUpTo('Support e-mail', brandingLimits.supportEmailMaxLength, false)(value);
      if (typeof value === 'string' && value.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new SettingsError('Support e-mail must be a valid address');
      }
    },
  }),
  definePublicSetting({
    key: settingKeys.publicBrandingSupportUrl,
    categoryId: settingCategoryIds.publicBranding,
    valueType: 'string',
    description: 'Support or intranet page (https) shown on the sign-in page and in e-mail footers',
    isRequired: false,
    defaultValue: '',
    assertValue: (value) => {
      textUpTo('Support URL', brandingLimits.supportUrlMaxLength, false)(value);
      if (typeof value === 'string' && value.length > 0 && !/^https:\/\/[^\s]+$/.test(value)) {
        throw new SettingsError('Support URL must start with https://');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateInstallCompletedAt,
    categoryId: settingCategoryIds.privateInstall,
    valueType: 'string',
    description:
      'ISO datetime when the first-run install wizard completed; empty means the setup gate is active',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateInstallCompletedByUserId,
    categoryId: settingCategoryIds.privateInstall,
    valueType: 'string',
    description:
      'User id of the SuperAdmin who locked the first-run install wizard',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthMode,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description: 'Authentication provider mode selected at install',
    isRequired: true,
    allowedValues: ['local', 'entra_ad'],
    defaultValue: 'local',
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthJwtSigningSecret,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'Signing secret for local development JWT; never expose outside trusted backend use',
    isRequired: false,
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthAzureTenantId,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'Microsoft Entra tenant identifier used to validate issuer and tenant claims',
    isRequired: false,
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthAzureClientId,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'Microsoft Entra application client identifier used as the expected token audience',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdLdapsUrlsCsv,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'Comma-separated LDAPS URLs used for directory bind when authentication mode is entra_ad',
    isRequired: false,
    defaultValue: '',
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthAdBindDn,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'Distinguished name of the read-only LDAPS bind account; never expose outside trusted backend use',
    isRequired: false,
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthAdBindPassword,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'Password of the read-only LDAPS bind account; never expose outside trusted backend use',
    isRequired: false,
  }),
];
