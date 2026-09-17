import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const ticketSlaSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketSlaEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Enable the SLA engine for ticket response and resolution targets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaRequireAdminReasonForRuleChanges,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Require an explicit reason for SLA calendar, profile and rule mutations',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaAllowServiceOverrides,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Allow SLA rules to target a specific service',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaAllowOuOverrides,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Allow SLA rules to target a specific organizational unit',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaPauseOnWaitingForUser,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Pause SLA timers while a ticket is waiting for the user',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaPauseOnPendingApproval,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Pause SLA timers while a ticket is pending approval',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaNotifyBeforeOverdueMinutes,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description:
      'Minutes before an SLA due time to mark the ticket at risk and notify handlers',
    isRequired: true,
    defaultValue: 30,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaEscalationsEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Emit SLA escalation events when response or resolution timers expire',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaEscalationsEmailEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Send email when an SLA escalation fires (in addition to in-app)',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSlaMaxEscalationLevels,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Maximum number of escalation rules allowed per SLA profile',
    isRequired: true,
    defaultValue: 3,
  }),
];
