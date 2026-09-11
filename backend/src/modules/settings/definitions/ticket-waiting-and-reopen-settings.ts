import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const ticketWaitingAndReopenSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketWaitingForUserEnabled,
    valueType: 'boolean',
    description:
      'Enable waiting-for-user reminder, auto-close, and reply resume',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketWaitingForUserReminderAfterDays,
    valueType: 'number',
    description: 'Days without a user reply before a waiting reminder is recorded',
    isRequired: true,
    defaultValue: 2,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketWaitingForUserAutoCloseAfterDays,
    valueType: 'number',
    description: 'Days without a user reply before a waiting ticket is auto-closed',
    isRequired: true,
    defaultValue: 7,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketReopenEnabled,
    valueType: 'boolean',
    description: 'Allow reopening resolved or closed tickets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketReopenWindowDays,
    valueType: 'number',
    description:
      'Days after resolve or close when reopen continues the same ticket',
    isRequired: true,
    defaultValue: 7,
  }),
];
