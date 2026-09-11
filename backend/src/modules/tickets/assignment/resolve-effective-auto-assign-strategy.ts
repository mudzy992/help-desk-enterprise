import type { AutoAssignStrategy } from '../../../generated/prisma/enums';
import type { TicketAssignmentConfiguration } from './assignment.types';

export function resolveEffectiveAutoAssignStrategy(input: {
  readonly configuration: TicketAssignmentConfiguration;
  readonly serviceStrategy: AutoAssignStrategy | null;
}): AutoAssignStrategy {
  if (!input.configuration.autoAssignEnabled) {
    return 'NONE';
  }
  if (
    input.serviceStrategy === 'LEAST_BUSY' ||
    input.serviceStrategy === 'ROUND_ROBIN'
  ) {
    return input.serviceStrategy;
  }
  return input.configuration.autoAssignStrategy;
}
