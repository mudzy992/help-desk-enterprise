import { TicketsError } from '../tickets.error';
import type { TicketAssignmentConfiguration } from './assignment.types';

const globalStrategyMap = {
  least_busy: 'LEAST_BUSY',
  round_robin: 'ROUND_ROBIN',
} as const;

export function parseTicketAssignmentConfiguration(input: {
  readonly groupInboxEnabled: unknown;
  readonly autoAssignEnabled: unknown;
  readonly autoAssignStrategy: unknown;
}): TicketAssignmentConfiguration {
  if (
    typeof input.groupInboxEnabled !== 'boolean' ||
    typeof input.autoAssignEnabled !== 'boolean' ||
    typeof input.autoAssignStrategy !== 'string'
  ) {
    throw new TicketsError('ASSIGNMENT_UNAVAILABLE');
  }
  const mapped =
    globalStrategyMap[
      input.autoAssignStrategy.trim() as keyof typeof globalStrategyMap
    ];
  if (mapped === undefined) {
    throw new TicketsError('ASSIGNMENT_UNAVAILABLE');
  }
  return {
    groupInboxEnabled: input.groupInboxEnabled,
    autoAssignEnabled: input.autoAssignEnabled,
    autoAssignStrategy: mapped,
  };
}
