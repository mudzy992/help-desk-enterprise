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
];
