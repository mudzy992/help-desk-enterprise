import {
  definePrivateSetting,
  definePublicSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const foundationalSettings: readonly SettingDefinition[] = [
  definePublicSetting({
    key: settingKeys.publicBrandingAppName,
    valueType: 'string',
    description: 'Application name shown in the header',
    isRequired: true,
    defaultValue: 'EP-HelpDesk',
  }),
  definePrivateSetting({
    key: settingKeys.privateInstallCompletedAt,
    valueType: 'string',
    description:
      'ISO datetime when the first-run install wizard completed; empty means the setup gate is active',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateInstallCompletedByUserId,
    valueType: 'string',
    description:
      'User id of the SuperAdmin who locked the first-run install wizard',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthMode,
    valueType: 'string',
    description: 'Authentication provider mode selected at install',
    isRequired: true,
    allowedValues: ['local', 'entra_ad'],
    defaultValue: 'local',
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthJwtSigningSecret,
    valueType: 'string',
    description:
      'Signing secret for local development JWT; never expose outside trusted backend use',
    isRequired: false,
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthAzureTenantId,
    valueType: 'string',
    description:
      'Microsoft Entra tenant identifier used to validate issuer and tenant claims',
    isRequired: false,
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthAzureClientId,
    valueType: 'string',
    description:
      'Microsoft Entra application client identifier used as the expected token audience',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdLdapsUrlsCsv,
    valueType: 'string',
    description:
      'Comma-separated LDAPS URLs used for directory bind when authentication mode is entra_ad',
    isRequired: false,
    defaultValue: '',
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthAdBindDn,
    valueType: 'string',
    description:
      'Distinguished name of the read-only LDAPS bind account; never expose outside trusted backend use',
    isRequired: false,
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthAdBindPassword,
    valueType: 'string',
    description:
      'Password of the read-only LDAPS bind account; never expose outside trusted backend use',
    isRequired: false,
  }),
];
