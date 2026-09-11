import { TicketsError } from '../tickets.error';
import { defaultTicketReopenConfiguration } from './reopen.constants';
import type { TicketReopenConfiguration } from './reopen.types';

export function parseTicketReopenConfiguration(input: {
  readonly enabled: unknown;
  readonly windowDays: unknown;
}): TicketReopenConfiguration {
  if (input.enabled === false) {
    return {
      ...defaultTicketReopenConfiguration,
      enabled: false,
    };
  }
  if (input.enabled !== true) {
    throw new TicketsError('REOPEN_UNAVAILABLE');
  }
  if (
    typeof input.windowDays !== 'number' ||
    !Number.isFinite(input.windowDays) ||
    input.windowDays <= 0
  ) {
    throw new TicketsError('REOPEN_UNAVAILABLE');
  }
  return {
    enabled: true,
    windowDays: input.windowDays,
  };
}
