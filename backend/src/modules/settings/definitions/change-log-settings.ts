import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const changeLogSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateChangeLogSettingsEnabled,
    valueType: 'boolean',
    description: 'Record a change-log entry for successful settings mutations',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateChangeLogRoutingEnabled,
    valueType: 'boolean',
    description: 'Record a change-log entry for successful routing mutations',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateChangeLogSlaEnabled,
    valueType: 'boolean',
    description:
      'Record a change-log entry for successful SLA calendar, profile and rule mutations',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateChangeLogIncludeDiff,
    valueType: 'boolean',
    description: 'Store a deterministic before/after diff on each change-log entry',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateChangeLogRequireReason,
    valueType: 'boolean',
    description:
      'Require an explicit caller-supplied reason for settings and routing mutations',
    isRequired: true,
    defaultValue: true,
  }),
];
