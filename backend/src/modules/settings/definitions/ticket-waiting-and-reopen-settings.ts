import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const ticketWaitingAndReopenSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketWaitingForUserEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Enable waiting-for-user reminder, auto-close, and reply resume',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketWaitingForUserReminderAfterDays,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Days without a user reply before a waiting reminder is recorded',
    isRequired: true,
    defaultValue: 2,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketWaitingForUserAutoCloseAfterDays,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Days without a user reply before a waiting ticket is auto-closed',
    isRequired: true,
    defaultValue: 7,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketReopenEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Allow reopening resolved or closed tickets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketReopenWindowDays,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description:
      'Days after resolve or close when reopen continues the same ticket',
    isRequired: true,
    defaultValue: 7,
  }),
];
