import type { ServiceAvailability } from '../../generated/prisma/enums';
import {
  defaultServiceAvailabilityConfigurationBundle,
  serviceAvailabilityStatuses,
} from './service-availability.constants';
import type {
  ServiceAvailabilityConfiguration,
  ServiceAvailabilityConfigurationBundle,
  ServiceAvailabilityEvaluationContext,
  ServiceDowntimeConfiguration,
} from './service-availability.types';
import { ServiceCatalogError } from './service-catalog.error';

export function defaultServiceAvailabilityEvaluationContext(
  now: Date = new Date(),
): ServiceAvailabilityEvaluationContext {
  return {
    now,
    ...defaultServiceAvailabilityConfigurationBundle,
  };
}

export function parseServiceAvailabilityConfigurationBundle(input: {
  readonly availabilityEnabled: unknown;
  readonly allowedStatusesCsv: unknown;
  readonly showStatusInCatalog: unknown;
  readonly showStatusInTicketCreate: unknown;
  readonly changeRequiresReason: unknown;
  readonly downtimeEnabled: unknown;
  readonly autoSetMaintenanceStatus: unknown;
  readonly autoRestoreOperational: unknown;
  readonly requireReason: unknown;
}): ServiceAvailabilityConfigurationBundle {
  return {
    availability: parseServiceAvailabilityConfiguration({
      enabled: input.availabilityEnabled,
      allowedStatusesCsv: input.allowedStatusesCsv,
      showStatusInCatalog: input.showStatusInCatalog,
      showStatusInTicketCreate: input.showStatusInTicketCreate,
      changeRequiresReason: input.changeRequiresReason,
    }),
    downtime: parseServiceDowntimeConfiguration({
      enabled: input.downtimeEnabled,
      autoSetMaintenanceStatus: input.autoSetMaintenanceStatus,
      autoRestoreOperational: input.autoRestoreOperational,
      requireReason: input.requireReason,
    }),
  };
}

export function parseServiceAvailabilityConfiguration(input: {
  readonly enabled: unknown;
  readonly allowedStatusesCsv: unknown;
  readonly showStatusInCatalog: unknown;
  readonly showStatusInTicketCreate: unknown;
  readonly changeRequiresReason: unknown;
}): ServiceAvailabilityConfiguration {
  if (
    typeof input.enabled !== 'boolean' ||
    typeof input.showStatusInCatalog !== 'boolean' ||
    typeof input.showStatusInTicketCreate !== 'boolean' ||
    typeof input.changeRequiresReason !== 'boolean'
  ) {
    throw new ServiceCatalogError('AVAILABILITY_UNAVAILABLE');
  }
  return {
    enabled: input.enabled,
    allowedStatuses: parseAllowedStatuses(input.allowedStatusesCsv),
    showStatusInCatalog: input.showStatusInCatalog,
    showStatusInTicketCreate: input.showStatusInTicketCreate,
    changeRequiresReason: input.changeRequiresReason,
  };
}

export function parseServiceDowntimeConfiguration(input: {
  readonly enabled: unknown;
  readonly autoSetMaintenanceStatus: unknown;
  readonly autoRestoreOperational: unknown;
  readonly requireReason: unknown;
}): ServiceDowntimeConfiguration {
  if (
    typeof input.enabled !== 'boolean' ||
    typeof input.autoSetMaintenanceStatus !== 'boolean' ||
    typeof input.autoRestoreOperational !== 'boolean' ||
    typeof input.requireReason !== 'boolean'
  ) {
    throw new ServiceCatalogError('DOWNTIME_UNAVAILABLE');
  }
  return {
    enabled: input.enabled,
    autoSetMaintenanceStatus: input.autoSetMaintenanceStatus,
    autoRestoreOperational: input.autoRestoreOperational,
    requireReason: input.requireReason,
  };
}

function parseAllowedStatuses(value: unknown): readonly ServiceAvailability[] {
  if (typeof value !== 'string') {
    throw new ServiceCatalogError('AVAILABILITY_UNAVAILABLE');
  }
  const statuses: ServiceAvailability[] = [];
  const seen = new Set<string>();
  for (const part of value.split(',')) {
    const token = part.trim();
    if (token.length === 0 || seen.has(token)) {
      continue;
    }
    if (!isServiceAvailability(token)) {
      throw new ServiceCatalogError('AVAILABILITY_UNAVAILABLE');
    }
    seen.add(token);
    statuses.push(token);
  }
  if (statuses.length === 0) {
    throw new ServiceCatalogError('AVAILABILITY_UNAVAILABLE');
  }
  return statuses;
}

function isServiceAvailability(value: string): value is ServiceAvailability {
  return (serviceAvailabilityStatuses as readonly string[]).includes(value);
}
