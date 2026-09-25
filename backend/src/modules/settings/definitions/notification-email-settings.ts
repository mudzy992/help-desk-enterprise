import { SettingsError } from '../settings.error';
import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import {
  defaultEmailTemplates,
  serializeEmailTemplateRegistry,
} from '../../notifications/email/default-email-templates';
import { assertEmailTemplateRegistryJson } from '../../notifications/email/parse-email-template-registry';
import { settingCategoryIds } from '../setting-categories';

const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const notificationEmailSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateNotificationsEdgeEnabled,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'boolean',
    description: 'Enable Edge/Windows notification delivery for the extension',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsEmailEnabled,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'boolean',
    description:
      'Enable email notifications; delivery still requires SMTP and the email addon',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsTemplatesEnabled,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'boolean',
    description:
      'Use editable email templates; when off, built-in subject and body defaults are used',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsEmailInternalOnly,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'boolean',
    description:
      'Restrict email delivery to internal @epbih.ba addresses; external allow-lists are ignored while on',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsEmailAllowedExternalDomainsCsv,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'string',
    description:
      'Comma-separated domains allowed when internal-only delivery is off',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsEmailAllowedExternalEmailsCsv,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'string',
    description:
      'Comma-separated email addresses allowed when internal-only delivery is off',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsTemplatesRegistryJson,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'string',
    description:
      'JSON registry of email subject and body templates with allow-listed placeholders',
    isRequired: true,
    defaultValue: serializeEmailTemplateRegistry(defaultEmailTemplates),
    assertValue: (value) => {
      if (typeof value === 'string') {
        assertEmailTemplateRegistryJson(value);
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsEmailIncludeMessageExcerpt,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'boolean',
    description:
      'Include the (redacted) public reply text in new-message e-mails; never for confidential tickets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsEmailReplyMode,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'string',
    description:
      'no_reply: replies go through the application; shared_mailbox: Reply-To is the shared mailbox',
    isRequired: true,
    defaultValue: 'no_reply',
    allowedValues: ['no_reply', 'shared_mailbox'],
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsEmailReplyToAddress,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'string',
    description: 'Shared mailbox address used as Reply-To in shared_mailbox mode',
    isRequired: false,
    defaultValue: '',
    assertValue: (value) => {
      if (typeof value === 'string' && value.trim().length > 0 && !emailAddressPattern.test(value.trim())) {
        throw new SettingsError('Reply-To must be a valid e-mail address', 'INVALID_SETTING_VALUE');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsEmailAccentColor,
    categoryId: settingCategoryIds.privateNotifications,
    valueType: 'string',
    description: 'Accent colour of e-mails (#rrggbb)',
    isRequired: true,
    defaultValue: '#4f46e5',
    assertValue: (value) => {
      if (typeof value === 'string' && !/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw new SettingsError('Accent colour must be #rrggbb', 'INVALID_SETTING_VALUE');
      }
    },
  }),
];
