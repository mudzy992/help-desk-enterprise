import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const ticketRoutingSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketUnroutedQueueEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Keep unmatched (origin unit, service) combinations in the explicit UNROUTED queue',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketUnroutedQueueOwnerRole,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Role that owns the UNROUTED queue; never used as a fake handler group',
    isRequired: true,
    defaultValue: 'SUPER_ADMIN',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketRoutingRequireCoverage,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Block service activation when the service has no routing rules (exact or inherited)',
    isRequired: true,
    defaultValue: true,
  }),
];
