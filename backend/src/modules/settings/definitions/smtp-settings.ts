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
    group: 'connection',
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'boolean',
    description:
      'Enables SMTP delivery; when off, the email addon is forcibly disabled',
    isRequired: true,
    defaultValue: false,
    // Paket 5.3.3 (D6): the same rule the config snapshot export already
    // enforces (SMTP_HOST_REQUIRED) — switching SMTP on without a host would
    // only fail later, on the first mail. Setting the host in the same batch is
    // allowed, because the gate judges the state the request produces.
    requires: [{ key: settingKeys.privateSmtpHost, notEmpty: true }],
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpHost,
    group: 'connection',
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'string',
    description: 'SMTP server hostname used when SMTP is enabled',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpPort,
    group: 'connection',
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'number',
    description: 'SMTP server port used when SMTP is enabled',
    isRequired: true,
    defaultValue: 587,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpTls,
    group: 'connection',
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'boolean',
    description: 'Whether SMTP uses TLS when SMTP is enabled',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpUsername,
    group: 'authentication',
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'string',
    description: 'SMTP authentication username used when SMTP is enabled',
    isRequired: false,
    defaultValue: '',
  }),
  defineSecretSetting({
    key: settingKeys.privateSmtpPassword,
    group: 'authentication',
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'string',
    description:
      'SMTP authentication password; never expose outside trusted backend use',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpFromAddress,
    group: 'sender',
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'string',
    description: 'From address used for outbound SMTP mail when SMTP is enabled',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateSmtpProvider,
    group: 'connection',
    categoryId: settingCategoryIds.privateSmtp,
    valueType: 'string',
    description:
      'Mail provider preset (o365, gmail, smtp); fills host, port and TLS when the host is empty',
    isRequired: true,
    defaultValue: 'o365',
    allowedValues: ['o365', 'gmail', 'smtp'],
  }),
];
