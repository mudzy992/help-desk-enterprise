import { definePublicSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const maintenanceSettings: readonly SettingDefinition[] = [
  definePublicSetting({
    key: settingKeys.publicMaintenanceEnabled,
    valueType: 'boolean',
    description: 'Show the non-blocking maintenance banner to end users',
    isRequired: true,
    defaultValue: false,
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceMessage,
    valueType: 'string',
    description: 'Text shown in the maintenance banner when enabled',
    isRequired: false,
    defaultValue: '',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceFromAt,
    valueType: 'string',
    description: 'Maintenance window start as an ISO datetime string',
    isRequired: false,
    defaultValue: '',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceToAt,
    valueType: 'string',
    description: 'Maintenance window end as an ISO datetime string',
    isRequired: false,
    defaultValue: '',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceScope,
    valueType: 'string',
    description:
      'Maintenance banner scope: global, per_service, or both',
    isRequired: true,
    allowedValues: ['global', 'per_service', 'both'],
    defaultValue: 'both',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceAffectedServicesCsv,
    valueType: 'string',
    description:
      'Comma-separated service names or ids affected when scope is per_service or both',
    isRequired: false,
    defaultValue: '',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceIsBlocking,
    valueType: 'boolean',
    description:
      'When true, may block ticket creation for affected services; keep false for MVP',
    isRequired: true,
    defaultValue: false,
  }),
];
