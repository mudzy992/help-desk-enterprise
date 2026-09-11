import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const smtpSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSmtpEnabled,
    valueType: 'boolean',
    description:
      'Enables SMTP delivery; when off, the email addon is forcibly disabled',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpHost,
    valueType: 'string',
    description: 'SMTP server hostname used when SMTP is enabled',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpPort,
    valueType: 'number',
    description: 'SMTP server port used when SMTP is enabled',
    isRequired: true,
    defaultValue: 587,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpTls,
    valueType: 'boolean',
    description: 'Whether SMTP uses TLS when SMTP is enabled',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpUsername,
    valueType: 'string',
    description: 'SMTP authentication username used when SMTP is enabled',
    isRequired: false,
    defaultValue: '',
  }),
  defineSecretSetting({
    key: settingKeys.privateSmtpPassword,
    valueType: 'string',
    description:
      'SMTP authentication password; never expose outside trusted backend use',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpFromAddress,
    valueType: 'string',
    description: 'From address used for outbound SMTP mail when SMTP is enabled',
    isRequired: false,
    defaultValue: '',
  }),
];
