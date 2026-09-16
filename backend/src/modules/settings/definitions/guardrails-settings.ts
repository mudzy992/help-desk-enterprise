import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';
import {
  defaultTicketGuardrailsConfiguration,
  guardrailModes,
} from '../../tickets/guardrails/guardrails.constants';

export const guardrailsSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateGuardrailsAntiLoopEnabled,
    categoryId: settingCategoryIds.privateGuardrails,
    valueType: 'boolean',
    description: 'Detect duplicate tickets and suppress automation/event loops',
    isRequired: true,
    defaultValue: defaultTicketGuardrailsConfiguration.enabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateGuardrailsAntiLoopDuplicateWindowMinutes,
    categoryId: settingCategoryIds.privateGuardrails,
    valueType: 'number',
    description: 'Minutes to look back for duplicate tickets and repeated triggers',
    isRequired: true,
    defaultValue: defaultTicketGuardrailsConfiguration.duplicateWindowMinutes,
  }),
  definePrivateSetting({
    key: settingKeys.privateGuardrailsAntiLoopSimilarityThreshold,
    categoryId: settingCategoryIds.privateGuardrails,
    valueType: 'number',
    description: 'Description similarity needed to treat a new ticket as a duplicate',
    isRequired: true,
    defaultValue: defaultTicketGuardrailsConfiguration.similarityThreshold,
  }),
  definePrivateSetting({
    key: settingKeys.privateGuardrailsAntiLoopMode,
    categoryId: settingCategoryIds.privateGuardrails,
    valueType: 'string',
    description: 'warn_only records a warning; soft_block rejects unacknowledged duplicates',
    isRequired: true,
    allowedValues: [...guardrailModes],
    defaultValue: defaultTicketGuardrailsConfiguration.mode,
  }),
  definePrivateSetting({
    key: settingKeys.privateGuardrailsBulkBroadcastConfirmAboveRecipients,
    categoryId: settingCategoryIds.privateGuardrails,
    valueType: 'number',
    description: 'Require extra confirmation when a bulk broadcast exceeds this recipient count',
    isRequired: true,
    defaultValue: defaultTicketGuardrailsConfiguration.confirmAboveRecipients,
  }),
];
