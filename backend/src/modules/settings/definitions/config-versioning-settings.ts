import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const defaultConfigVersioningScopesCsv =
  'settings,routing,sla,service_catalog,service_forms,templates';

export const configVersioningSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningEnabled,
    categoryId: settingCategoryIds.privateConfigVersioning,
    valueType: 'boolean',
    description: 'Enable config version snapshots, validation, and rollback',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningAllowRollback,
    requires: [{ key: settingKeys.privateConfigVersioningEnabled, equals: true }],
    categoryId: settingCategoryIds.privateConfigVersioning,
    valueType: 'boolean',
    description: 'Allow permission-gated rollback to a previous config version',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningValidationEnabled,
    requires: [{ key: settingKeys.privateConfigVersioningEnabled, equals: true }],
    categoryId: settingCategoryIds.privateConfigVersioning,
    valueType: 'boolean',
    description: 'Run dry-run validation before activating a config version',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningValidationBlockActivationOnError,
    requires: [{ key: settingKeys.privateConfigVersioningValidationEnabled, equals: true }],
    categoryId: settingCategoryIds.privateConfigVersioning,
    valueType: 'boolean',
    description: 'Block activation when dry-run validation returns errors',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningShadowModeEnabled,
    requires: [{ key: settingKeys.privateConfigVersioningEnabled, equals: true }],
    categoryId: settingCategoryIds.privateConfigVersioning,
    valueType: 'boolean',
    description:
      'Compare candidate routing and SLA resolution against the active version without applying it',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningScopesCsv,
    categoryId: settingCategoryIds.privateConfigVersioning,
    valueType: 'string',
    description:
      'Comma-separated snapshot scopes: settings, routing, sla, service_catalog, service_forms',
    isRequired: true,
    defaultValue: defaultConfigVersioningScopesCsv,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningEnvironmentName,
    categoryId: settingCategoryIds.privateConfigVersioning,
    valueType: 'string',
    description:
      'Name of this installation (e.g. staging, production) written into exported configuration packages',
    isRequired: false,
    defaultValue: '',
  }),
];
