import type { ServiceLifecycle } from '../../generated/prisma/enums';
import type { ServiceLifecycleConfiguration } from './service-catalog.types';

export const serviceLifecycleStates = [
  'DRAFT',
  'ACTIVE',
  'DEPRECATED',
] as const satisfies readonly ServiceLifecycle[];

export const allowedServiceLifecycleTransitions: Readonly<
  Record<ServiceLifecycle, readonly ServiceLifecycle[]>
> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['DEPRECATED'],
  DEPRECATED: ['ACTIVE'],
};

export const defaultServiceLifecycleConfiguration: ServiceLifecycleConfiguration =
  {
    enabled: true,
    allowedStates: serviceLifecycleStates,
    defaultStateOnCreate: 'DRAFT',
  };

export const serviceCatalogChangeLogEntityTypes = {
  service: 'service',
  serviceCategory: 'service_category',
  serviceDowntimeWindow: 'service_downtime_window',
} as const;

export const serviceCatalogConstants = {
  maximumNameLength: 128,
  maximumSlugLength: 64,
} as const;
