import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const smtpSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSmtpEnabled,
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'boolean',
    description:
      'Enables SMTP delivery; when off, the email addon is forcibly disabled',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpHost,
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'string',
    description: 'SMTP server hostname used when SMTP is enabled',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpPort,
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'number',
    description: 'SMTP server port used when SMTP is enabled',
    isRequired: true,
    defaultValue: 587,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpTls,
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'boolean',
    description: 'Whether SMTP uses TLS when SMTP is enabled',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpUsername,
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'string',
    description: 'SMTP authentication username used when SMTP is enabled',
    isRequired: false,
    defaultValue: '',
  }),
  defineSecretSetting({
    key: settingKeys.privateSmtpPassword,
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'string',
    description:
      'SMTP authentication password; never expose outside trusted backend use',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpFromAddress,
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'string',
    description: 'From address used for outbound SMTP mail when SMTP is enabled',
    isRequired: false,
    defaultValue: '',
  }),
];
