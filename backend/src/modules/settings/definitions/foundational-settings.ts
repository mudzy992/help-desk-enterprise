import {
  definePrivateSetting,
  definePublicSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const foundationalSettings: readonly SettingDefinition[] = [
  definePublicSetting({
    key: settingKeys.publicBrandingAppName,
    categoryId: settingCategoryIds.publicBranding,
    valueType: 'string',
    description: 'Application name shown in the header',
    isRequired: true,
    defaultValue: 'EP-HelpDesk',
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
