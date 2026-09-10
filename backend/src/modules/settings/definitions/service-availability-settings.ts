import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const serviceAvailabilitySettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateServicesAvailabilityEnabled,
    valueType: 'boolean',
    description:
      'Master switch for service availability status; off ignores stored unavailability in runtime evaluation',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesAvailabilityAllowedStatusesCsv,
    valueType: 'string',
    description:
      'Comma-separated service availability statuses that may be stored or targeted',
    isRequired: true,
    defaultValue: 'OPERATIONAL,DEGRADED,DOWN,MAINTENANCE',
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesAvailabilityShowStatusInCatalog,
    valueType: 'boolean',
    description: 'Expose availability status on catalog service responses',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesAvailabilityShowStatusInTicketCreate,
    valueType: 'boolean',
    description:
      'Expose availability status to ticket-create callers for warnings; creation stays allowed',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesAvailabilityChangeRequiresReason,
    valueType: 'boolean',
    description: 'Require a reason when changing stored service availability',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesDowntimeSchedulingEnabled,
    valueType: 'boolean',
    description: 'Master switch for scheduling and overlaying service downtime windows',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesDowntimeSchedulingAutoSetMaintenanceStatus,
    valueType: 'boolean',
    description:
      'During an active downtime window, overlay effective availability as MAINTENANCE',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesDowntimeSchedulingAutoRestoreOperational,
    valueType: 'boolean',
    description:
      'After a window ends, drop the downtime overlay so effective availability returns to the stored status',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesDowntimeSchedulingRequireReason,
    valueType: 'boolean',
    description: 'Require a reason when creating, updating, or deleting downtime windows',
    isRequired: true,
    defaultValue: true,
  }),
];
