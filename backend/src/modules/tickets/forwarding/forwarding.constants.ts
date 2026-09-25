import type { TicketStatus } from '../../../generated/prisma/enums';
import type { TicketForwardingConfiguration } from './forwarding.types';

/** RAW §1.1 rule 1: open work only (no approval, resolved, closed, archived). */
export const forwardableTicketStatuses = [
  'UNROUTED',
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
] as const satisfies readonly TicketStatus[];

export const ticketForwardingConstants = {
  maximumReasonLength: 1000,
  minimumReasonLengthFloor: 1,
  minimumReasonLengthCeiling: 500,
} as const;

export const defaultTicketForwardingConfiguration: TicketForwardingConfiguration =
  {
    allowCrossOu: true,
    requireReason: true,
    keepPreviousHandlersAsWatchers: false,
    notifyRequester: true,
    minReasonLength: 10,
  };
