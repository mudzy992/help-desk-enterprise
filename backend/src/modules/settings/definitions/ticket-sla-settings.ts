import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const ticketSlaSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketSlaEnabled,
    valueType: 'boolean',
    description: 'Enable the SLA engine for ticket response and resolution targets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaRequireAdminReasonForRuleChanges,
    valueType: 'boolean',
    description: 'Require an explicit reason for SLA calendar, profile and rule mutations',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaAllowServiceOverrides,
    valueType: 'boolean',
    description: 'Allow SLA rules to target a specific service',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaAllowOuOverrides,
    valueType: 'boolean',
    description: 'Allow SLA rules to target a specific organizational unit',
    isRequired: true,
    defaultValue: true,
  }),
];
