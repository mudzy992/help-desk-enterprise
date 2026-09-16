import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const defaultRequiredOnResolveCsv = 'close_code,resolution_note';

export const ticketRequiredFieldsSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateWorkflowRequiredFieldsEnabled,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'boolean',
    description: 'Enforce required fields before RESOLVED or CLOSED',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateWorkflowRequiredFieldsGlobalRequiredOnResolveCsv,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'string',
    description: 'Global fields required before resolve or close',
    isRequired: true,
    defaultValue: defaultRequiredOnResolveCsv,
  }),
  defineSecretSetting({
    key: settingKeys.privateWorkflowRequiredFieldsByServiceJson,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'string',
    description:
      'JSON map of serviceId to extra required field keys; never expose outside trusted backend use',
    isRequired: false,
  }),
];
