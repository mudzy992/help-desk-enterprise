import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const defaultRedactionApplyToFieldsCsv =
  'ticket_title,ticket_description,chat_message';

export const securityRedactionSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSecurityRedactionEnabled,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'boolean',
    description: 'Detect secrets and PII in ticket title, description, and chat',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRedactionMode,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description: 'warn_only records a warning; soft_block rejects high-risk matches',
    isRequired: true,
    allowedValues: ['warn_only', 'soft_block'],
    defaultValue: 'warn_only',
  }),
  defineSecretSetting({
    key: settingKeys.privateSecurityRedactionPatternsJson,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description:
      'JSON regex pattern registry for PII and secret detection; never expose outside trusted backend use',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRedactionApplyToFieldsCsv,
    categoryId: settingCategoryIds.privateSecurity,
    valueType: 'string',
    description: 'Fields scanned for PII and secrets',
    isRequired: true,
    defaultValue: defaultRedactionApplyToFieldsCsv,
  }),
];
