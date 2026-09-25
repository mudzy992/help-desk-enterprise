import { TicketsError } from '../tickets.error';
import { ticketForwardingConstants } from './forwarding.constants';
import type { TicketForwardingConfiguration } from './forwarding.types';

export function parseTicketForwardingConfiguration(input: {
  readonly allowCrossOu: unknown;
  readonly requireReason: unknown;
  readonly keepPreviousHandlersAsWatchers: unknown;
  readonly notifyRequester: unknown;
  readonly minReasonLength: unknown;
}): TicketForwardingConfiguration {
  if (
    typeof input.allowCrossOu !== 'boolean' ||
    typeof input.requireReason !== 'boolean' ||
    typeof input.keepPreviousHandlersAsWatchers !== 'boolean' ||
    typeof input.notifyRequester !== 'boolean' ||
    typeof input.minReasonLength !== 'number' ||
    !Number.isFinite(input.minReasonLength)
  ) {
    throw new TicketsError('FORWARDING_UNAVAILABLE');
  }
  return {
    allowCrossOu: input.allowCrossOu,
    requireReason: input.requireReason,
    keepPreviousHandlersAsWatchers: input.keepPreviousHandlersAsWatchers,
    notifyRequester: input.notifyRequester,
    minReasonLength: Math.min(
      ticketForwardingConstants.minimumReasonLengthCeiling,
      Math.max(
        ticketForwardingConstants.minimumReasonLengthFloor,
        Math.trunc(input.minReasonLength),
      ),
    ),
  };
}
