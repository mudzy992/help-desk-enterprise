import type { AutoAssignStrategy } from '../../../generated/prisma/enums';
import type { TicketAssignmentConfiguration } from './assignment.types';

/**
 * Priority group > service > global (decision D2): a group's own strategy, if
 * set, overrides its service's, which overrides the global setting.
 */
export function resolveEffectiveAutoAssignStrategy(input: {
  readonly configuration: TicketAssignmentConfiguration;
  readonly serviceStrategy: AutoAssignStrategy | null;
  readonly groupStrategy?: AutoAssignStrategy | null;
}): AutoAssignStrategy {
  if (!input.configuration.autoAssignEnabled) {
    return 'NONE';
  }
  if (isSpecificStrategy(input.groupStrategy)) {
    return input.groupStrategy;
  }
  if (isSpecificStrategy(input.serviceStrategy)) {
    return input.serviceStrategy;
  }
  return input.configuration.autoAssignStrategy;
}

function isSpecificStrategy(
  strategy: AutoAssignStrategy | null | undefined,
): strategy is 'LEAST_BUSY' | 'ROUND_ROBIN' {
  return strategy === 'LEAST_BUSY' || strategy === 'ROUND_ROBIN';
}
