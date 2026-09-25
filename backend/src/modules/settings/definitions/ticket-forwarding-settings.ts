import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

/** Package 1.1 — forwarding tickets between groups and OUs (RAW §settings). */
export const ticketForwardingSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketForwardingAllowCrossOu,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Allow forwarding a ticket to a group in another organizational unit (also needs ticket.forward.cross_ou)',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketForwardingRequireReason,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Require a free-text reason when forwarding a ticket',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketForwardingKeepPreviousHandlersAsWatchers,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Keep the previous assignee as a watcher after a forward (the forwarding agent can also opt in per forward)',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketForwardingNotifyRequester,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Notify the requester that the ticket moved to another team (without the reason)',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketForwardingMinReasonLength,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Minimum forward reason length in characters (1-500)',
    isRequired: true,
    defaultValue: 10,
  }),
];
