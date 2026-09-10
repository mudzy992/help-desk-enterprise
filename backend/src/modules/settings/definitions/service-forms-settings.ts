import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const serviceFormsSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketFormsEnabled,
    valueType: 'boolean',
    description: 'Master switch for schema-driven service forms',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketFormsRequireStructuredFields,
    valueType: 'boolean',
    description: 'Require at least one structured field in a form schema',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketFormsVersioningEnabled,
    valueType: 'boolean',
    description: 'Allow creating additional immutable form versions',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketFormsVersioningAllowMultipleActiveVersions,
    valueType: 'boolean',
    description: 'Allow more than one ACTIVE form version per service',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketFormsVersioningRequireVersionOnTicket,
    valueType: 'boolean',
    description: 'Require tickets to store an exact formVersionRef',
    isRequired: true,
    defaultValue: true,
  }),
];
