import type { ServiceAvailability } from '../../generated/prisma/enums';

export type ServiceRuntimeAvailabilityState =
  | 'CURRENTLY_AVAILABLE'
  | 'CURRENTLY_UNAVAILABLE'
  | 'SCHEDULED_DOWNTIME';

export type DowntimeWindowPhase = 'UPCOMING' | 'ACTIVE' | 'EXPIRED';

export type DowntimeWindowRecord = {
  readonly id: string;
  readonly serviceId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly message: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type DowntimeWindowResponse = {
  readonly id: string;
  readonly serviceId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly message: string;
  readonly phase: DowntimeWindowPhase;
  readonly isActive: boolean;
  readonly isUpcoming: boolean;
  readonly isExpired: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ServiceRuntimeAvailability = {
  readonly state: ServiceRuntimeAvailabilityState;
  readonly storedAvailability: ServiceAvailability;
  readonly effectiveAvailability: ServiceAvailability;
  readonly isCurrentlyAvailable: boolean;
  readonly isCurrentlyUnavailable: boolean;
  readonly hasActiveDowntime: boolean;
  readonly hasUpcomingDowntime: boolean;
  readonly activeDowntimeWindow: DowntimeWindowResponse | null;
  readonly upcomingDowntimeWindow: DowntimeWindowResponse | null;
  readonly ticketCreationAllowed: true;
  readonly showStatusInCatalog: boolean;
  readonly showStatusInTicketCreate: boolean;
  readonly evaluatedAt: string;
};

export type ServiceTicketCreationEligibility = {
  readonly allowed: true;
  readonly blockedByAvailability: false;
  readonly serviceId: string;
  readonly runtimeAvailability: ServiceRuntimeAvailability;
};

export type ServiceAvailabilityConfiguration = {
  readonly enabled: boolean;
  readonly allowedStatuses: readonly ServiceAvailability[];
  readonly showStatusInCatalog: boolean;
  readonly showStatusInTicketCreate: boolean;
  readonly changeRequiresReason: boolean;
};

export type ServiceDowntimeConfiguration = {
  readonly enabled: boolean;
  readonly autoSetMaintenanceStatus: boolean;
  readonly autoRestoreOperational: boolean;
  readonly requireReason: boolean;
};

export type ServiceAvailabilityConfigurationBundle = {
  readonly availability: ServiceAvailabilityConfiguration;
  readonly downtime: ServiceDowntimeConfiguration;
};

export type ServiceAvailabilityEvaluationContext =
  ServiceAvailabilityConfigurationBundle & {
    readonly now: Date;
  };

export type UpdateServiceAvailabilityInput = {
  readonly availability: ServiceAvailability;
  readonly reason?: string;
};

export type CreateServiceDowntimeWindowInput = {
  readonly startsAt: Date | string;
  readonly endsAt: Date | string;
  readonly message: string;
  readonly reason?: string;
};

export type UpdateServiceDowntimeWindowInput = {
  readonly startsAt?: Date | string;
  readonly endsAt?: Date | string;
  readonly message?: string;
  readonly reason?: string;
};
