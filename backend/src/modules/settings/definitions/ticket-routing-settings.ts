import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const ticketRoutingSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketUnroutedQueueEnabled,
    valueType: 'boolean',
    description:
      'Keep unmatched (origin unit, service) combinations in the explicit UNROUTED queue',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketUnroutedQueueOwnerRole,
    valueType: 'string',
    description: 'Role that owns the UNROUTED queue; never used as a fake handler group',
    isRequired: true,
    defaultValue: 'SUPER_ADMIN',
  }),
];
