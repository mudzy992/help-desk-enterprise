import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const ticketSplitSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketSplitEnabled,
    valueType: 'boolean',
    description: 'Allow agents to split a ticket into parent/child tickets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSplitAllowAttachmentMove,
    valueType: 'boolean',
    description: 'Allow moving attachments into split children; prefer copy/link',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSplitAllowMessageCopy,
    valueType: 'boolean',
    description: 'Allow copying selected messages into split children',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketSplitRequireReason,
    valueType: 'boolean',
    description: 'Require a reason when splitting a ticket',
    isRequired: true,
    defaultValue: true,
  }),
];
