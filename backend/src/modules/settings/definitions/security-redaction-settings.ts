import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const defaultRedactionApplyToFieldsCsv =
  'ticket_title,ticket_description,chat_message';

export const securityRedactionSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateSecurityRedactionEnabled,
    valueType: 'boolean',
    description: 'Detect secrets and PII in ticket title, description, and chat',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRedactionMode,
    valueType: 'string',
    description: 'warn_only records a warning; soft_block rejects high-risk matches',
    isRequired: true,
    allowedValues: ['warn_only', 'soft_block'],
    defaultValue: 'warn_only',
  }),
  defineSecretSetting({
    key: settingKeys.privateSecurityRedactionPatternsJson,
    valueType: 'string',
    description:
      'JSON regex pattern registry for PII and secret detection; never expose outside trusted backend use',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateSecurityRedactionApplyToFieldsCsv,
    valueType: 'string',
    description: 'Fields scanned for PII and secrets',
    isRequired: true,
    defaultValue: defaultRedactionApplyToFieldsCsv,
  }),
];
