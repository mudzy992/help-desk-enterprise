import { definePublicSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const maintenanceSettings: readonly SettingDefinition[] = [
  definePublicSetting({
    key: settingKeys.publicMaintenanceEnabled,
    categoryId: settingCategoryIds.publicMaintenance,
    valueType: 'boolean',
    description: 'Show the non-blocking maintenance banner to end users',
    isRequired: true,
    defaultValue: false,
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceMessage,
    categoryId: settingCategoryIds.publicMaintenance,
    valueType: 'string',
    description: 'Text shown in the maintenance banner when enabled',
    isRequired: false,
    defaultValue: '',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceFromAt,
    categoryId: settingCategoryIds.publicMaintenance,
    valueType: 'string',
    description: 'Maintenance window start as an ISO datetime string',
    isRequired: false,
    defaultValue: '',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceToAt,
    categoryId: settingCategoryIds.publicMaintenance,
    valueType: 'string',
    description: 'Maintenance window end as an ISO datetime string',
    isRequired: false,
    defaultValue: '',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceScope,
    categoryId: settingCategoryIds.publicMaintenance,
    valueType: 'string',
    description:
      'Maintenance banner scope: global, per_service, or both',
    isRequired: true,
    allowedValues: ['global', 'per_service', 'both'],
    defaultValue: 'both',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceAffectedServicesCsv,
    categoryId: settingCategoryIds.publicMaintenance,
    valueType: 'string',
    description:
      'Comma-separated service names or ids affected when scope is per_service or both',
    isRequired: false,
    defaultValue: '',
  }),
  definePublicSetting({
    key: settingKeys.publicMaintenanceIsBlocking,
    categoryId: settingCategoryIds.publicMaintenance,
    valueType: 'boolean',
    description:
      'When true, may block ticket creation for affected services; keep false for MVP',
    isRequired: true,
    defaultValue: false,
  }),
];
