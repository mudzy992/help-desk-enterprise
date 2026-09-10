import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const directorySyncSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadEnabled,
    valueType: 'boolean',
    description:
      'Enables directory read operations; off by default so directory access is never implicit',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadStrategy,
    valueType: 'string',
    description:
      'Directory synchronization strategy; independent from private.auth.mode',
    isRequired: true,
    allowedValues: ['manual_only', 'scheduled'],
    defaultValue: 'manual_only',
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadUsersBaseDn,
    valueType: 'string',
    description:
      'Base distinguished name that bounds user directory reads; empty rejects reads',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadGroupsBaseDn,
    valueType: 'string',
    description:
      'Base distinguished name that bounds group directory reads; empty rejects reads',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadMaxQueriesPerSecond,
    valueType: 'number',
    description: 'Maximum directory read queries per second for provider throttling',
    isRequired: true,
    defaultValue: 0.5,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadCacheTtlMinutes,
    valueType: 'number',
    description: 'Cache time-to-live in minutes for user and group directory reads',
    isRequired: true,
    defaultValue: 30,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadOuTreeCacheTtlHours,
    valueType: 'number',
    description:
      'Cache time-to-live in hours for organizational unit directory reads',
    isRequired: true,
    defaultValue: 12,
  }),
];
