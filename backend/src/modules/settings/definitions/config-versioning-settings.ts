import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const defaultConfigVersioningScopesCsv =
  'settings,routing,sla,service_catalog,service_forms';

export const configVersioningSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningEnabled,
    valueType: 'boolean',
    description: 'Enable config version snapshots, validation, and rollback',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningAllowRollback,
    valueType: 'boolean',
    description: 'Allow permission-gated rollback to a previous config version',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningValidationEnabled,
    valueType: 'boolean',
    description: 'Run dry-run validation before activating a config version',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningValidationBlockActivationOnError,
    valueType: 'boolean',
    description: 'Block activation when dry-run validation returns errors',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningShadowModeEnabled,
    valueType: 'boolean',
    description:
      'Compare candidate routing and SLA resolution against the active version without applying it',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateConfigVersioningScopesCsv,
    valueType: 'string',
    description:
      'Comma-separated snapshot scopes: settings, routing, sla, service_catalog, service_forms',
    isRequired: true,
    defaultValue: defaultConfigVersioningScopesCsv,
  }),
];
