import type { ServiceLifecycle } from '../../generated/prisma/enums';
import { allowedServiceLifecycleTransitions } from './service-catalog.constants';
import { ServiceCatalogError } from './service-catalog.error';
import type { ServiceLifecycleConfiguration } from './service-catalog.types';

export function isServiceOfferedToRequesters(
  lifecycle: ServiceLifecycle,
): boolean {
  return lifecycle === 'ACTIVE';
}

export function isAllowedServiceLifecycleState(
  lifecycle: ServiceLifecycle,
  allowedStates: readonly ServiceLifecycle[],
): boolean {
  return allowedStates.includes(lifecycle);
}

export function assertServiceLifecycleTransition(input: {
  readonly from: ServiceLifecycle;
  readonly to: ServiceLifecycle;
  readonly configuration: ServiceLifecycleConfiguration;
}): void {
  if (!input.configuration.enabled) {
    throw new ServiceCatalogError('LIFECYCLE_DISABLED');
  }
  if (!isAllowedServiceLifecycleState(input.to, input.configuration.allowedStates)) {
    throw new ServiceCatalogError('INVALID_LIFECYCLE_STATE');
  }
  const allowedTargets = allowedServiceLifecycleTransitions[input.from];
  if (!allowedTargets.includes(input.to)) {
    throw new ServiceCatalogError('INVALID_LIFECYCLE_TRANSITION');
  }
}
