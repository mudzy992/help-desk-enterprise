import type { ServiceAvailability } from '../../generated/prisma/enums';
import type {
  ServiceAvailabilityConfiguration,
  ServiceAvailabilityConfigurationBundle,
  ServiceDowntimeConfiguration,
  ServiceRuntimeAvailabilityState,
} from './service-availability.types';

export const serviceAvailabilityStatuses = [
  'OPERATIONAL',
  'DEGRADED',
  'DOWN',
  'MAINTENANCE',
] as const satisfies readonly ServiceAvailability[];

export const unavailableStoredAvailabilityStatuses = [
  'DOWN',
  'MAINTENANCE',
] as const satisfies readonly ServiceAvailability[];

export const serviceRuntimeAvailabilityStates = [
  'CURRENTLY_AVAILABLE',
  'CURRENTLY_UNAVAILABLE',
  'SCHEDULED_DOWNTIME',
] as const satisfies readonly ServiceRuntimeAvailabilityState[];

export const defaultServiceAvailabilityConfiguration: ServiceAvailabilityConfiguration =
  {
    enabled: true,
    allowedStatuses: serviceAvailabilityStatuses,
    showStatusInCatalog: true,
    showStatusInTicketCreate: true,
    changeRequiresReason: true,
  };

export const defaultServiceDowntimeConfiguration: ServiceDowntimeConfiguration =
  {
    enabled: true,
    autoSetMaintenanceStatus: true,
    autoRestoreOperational: true,
    requireReason: true,
  };

export const defaultServiceAvailabilityConfigurationBundle: ServiceAvailabilityConfigurationBundle =
  {
    availability: defaultServiceAvailabilityConfiguration,
    downtime: defaultServiceDowntimeConfiguration,
  };

export const serviceAvailabilityChangeLogReasons = {
  availabilityUpdate: 'availability_update',
  downtimeWindowCreate: 'downtime_window_create',
  downtimeWindowUpdate: 'downtime_window_update',
  downtimeWindowDelete: 'downtime_window_delete',
} as const;

export const serviceAvailabilityConstants = {
  maximumMessageLength: 512,
  maximumReasonLength: 512,
} as const;
