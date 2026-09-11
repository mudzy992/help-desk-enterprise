import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const ticketCollaborationSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketParticipantsEnabled,
    valueType: 'boolean',
    description: 'Enable the ticket participants model',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketParticipantsDefaultOnCreateCsv,
    valueType: 'string',
    description: 'Default participant roles created with a ticket',
    isRequired: true,
    defaultValue: 'REQUESTER,HANDLER_GROUP',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketChatMessageTypesEnabled,
    valueType: 'boolean',
    description: 'Enable typed ticket chat messages',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketChatMessageTypesAllowedCsv,
    valueType: 'string',
    description: 'Allowed ticket chat message types',
    isRequired: true,
    defaultValue:
      'USER_REPLY,AGENT_REPLY,INTERNAL_NOTE,SYSTEM_EVENT,APPROVAL_DECISION',
  }),
];
