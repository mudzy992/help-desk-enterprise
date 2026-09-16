import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const ticketAssignmentSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketAutoAssignEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Enable server-side auto-assignment of routed group tickets to an eligible agent',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketAutoAssignStrategy,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description:
      'Global auto-assign strategy used when the service strategy is NONE',
    isRequired: true,
    allowedValues: ['least_busy', 'round_robin'],
    defaultValue: 'least_busy',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketGroupInboxEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Enable the group inbox of unassigned tickets for handler group members',
    isRequired: true,
    defaultValue: true,
  }),
];
