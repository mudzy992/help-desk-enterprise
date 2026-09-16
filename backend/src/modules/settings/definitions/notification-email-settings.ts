import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import {
  defaultEmailTemplates,
  serializeEmailTemplateRegistry,
} from '../../notifications/email/default-email-templates';
import { assertEmailTemplateRegistryJson } from '../../notifications/email/parse-email-template-registry';
import { settingCategoryIds } from '../setting-categories';

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
];
