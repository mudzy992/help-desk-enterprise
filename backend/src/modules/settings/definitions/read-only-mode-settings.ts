import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const readOnlyModeSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateReadOnlyModeEnabled,
    valueType: 'boolean',
    description:
      'Master switch for admin-module read-only mode; off disables all module locks',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateReadOnlyModeModulesCsv,
    valueType: 'string',
    description:
      'Comma-separated admin modules that may be locked while read-only mode is enabled',
    isRequired: true,
    defaultValue:
      'admin,settings,routing,service_catalog,service_forms,sla',
  }),
  definePrivateSetting({
    key: settingKeys.privateReadOnlyModeActiveModulesCsv,
    valueType: 'string',
    description:
      'Comma-separated admin modules currently locked; empty means no module is locked',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateReadOnlyModeBypassRolesCsv,
    valueType: 'string',
    description:
      'Comma-separated role keys allowed to mutate locked admin modules; SuperAdmin still requires isLocalOnly',
    isRequired: true,
    defaultValue: 'SUPER_ADMIN',
  }),
];
