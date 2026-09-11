import { defaultRoutingConfiguration } from './routing.constants';
import { RoutingError } from './routing.error';
import type { RoutingConfiguration } from './routing.types';

export function parseRoutingConfiguration(input: {
  readonly enabled: unknown;
  readonly ownerRole: unknown;
}): RoutingConfiguration {
  if (typeof input.enabled !== 'boolean') {
    throw new RoutingError('UNAVAILABLE');
  }
  if (typeof input.ownerRole !== 'string') {
    throw new RoutingError('UNAVAILABLE');
  }
  const ownerRole = input.ownerRole.trim();
  return {
    unroutedQueueEnabled: input.enabled,
    unroutedQueueOwnerRole:
      ownerRole.length > 0
        ? ownerRole
        : defaultRoutingConfiguration.unroutedQueueOwnerRole,
  };
}
