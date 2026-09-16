import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const ticketCollaborationSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketParticipantsEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Enable the ticket participants model',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketParticipantsDefaultOnCreateCsv,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Default participant roles created with a ticket',
    isRequired: true,
    defaultValue: 'REQUESTER,HANDLER_GROUP',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketChatMessageTypesEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Enable typed ticket chat messages',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketChatMessageTypesAllowedCsv,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Allowed ticket chat message types',
    isRequired: true,
    defaultValue:
      'USER_REPLY,AGENT_REPLY,INTERNAL_NOTE,SYSTEM_EVENT,APPROVAL_DECISION',
  }),
];
