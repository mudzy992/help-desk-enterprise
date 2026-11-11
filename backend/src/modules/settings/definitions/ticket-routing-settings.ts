import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition, SettingValue } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const ticketRoutingSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTicketUnroutedQueueEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description:
      'Keep unmatched (origin unit, service) combinations in the explicit UNROUTED queue; with a target group set, tickets go there. A ticket is never lost: without a target group it stays UNROUTED even when this is off',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketUnroutedQueueOwnerRole,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description: 'Role that owns the UNROUTED queue and receives its overdue warnings and weekly digest',
    isRequired: true,
    defaultValue: 'SUPER_ADMIN',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketUnroutedQueueTargetGroupId,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'string',
    description:
      'Optional group id that receives tickets without a routing rule (status PENDING, SLA runs); empty keeps the UNROUTED queue',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketUnroutedQueueCleanupSlaHours,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Hours an unrouted ticket may wait before the owner is warned; 0 disables (0-168)',
    isRequired: true,
    defaultValue: 8,
    assertValue: (value: SettingValue) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 168) {
        throw new SettingsError('Unrouted cleanup hours must be an integer between 0 and 168');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateTicketUnroutedQueueWeeklyDigest,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Send the queue owner a Monday 08:00 digest of unrouted tickets still past the deadline',
    isRequired: true,
    defaultValue: true,
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
