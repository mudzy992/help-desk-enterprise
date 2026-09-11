import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import {
  defaultTicketGuardrailsConfiguration,
  guardrailModes,
} from '../../tickets/guardrails/guardrails.constants';

export const guardrailsSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateGuardrailsAntiLoopEnabled,
    valueType: 'boolean',
    description: 'Detect duplicate tickets and suppress automation/event loops',
    isRequired: true,
    defaultValue: defaultTicketGuardrailsConfiguration.enabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateGuardrailsAntiLoopDuplicateWindowMinutes,
    valueType: 'number',
    description: 'Minutes to look back for duplicate tickets and repeated triggers',
    isRequired: true,
    defaultValue: defaultTicketGuardrailsConfiguration.duplicateWindowMinutes,
  }),
  definePrivateSetting({
    key: settingKeys.privateGuardrailsAntiLoopSimilarityThreshold,
    valueType: 'number',
    description: 'Description similarity needed to treat a new ticket as a duplicate',
    isRequired: true,
    defaultValue: defaultTicketGuardrailsConfiguration.similarityThreshold,
  }),
  definePrivateSetting({
    key: settingKeys.privateGuardrailsAntiLoopMode,
    valueType: 'string',
    description: 'warn_only records a warning; soft_block rejects unacknowledged duplicates',
    isRequired: true,
    allowedValues: [...guardrailModes],
    defaultValue: defaultTicketGuardrailsConfiguration.mode,
  }),
  definePrivateSetting({
    key: settingKeys.privateGuardrailsBulkBroadcastConfirmAboveRecipients,
    valueType: 'number',
    description: 'Require extra confirmation when a bulk broadcast exceeds this recipient count',
    isRequired: true,
    defaultValue: defaultTicketGuardrailsConfiguration.confirmAboveRecipients,
  }),
];
