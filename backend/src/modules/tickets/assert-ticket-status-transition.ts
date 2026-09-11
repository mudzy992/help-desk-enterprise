import type { TicketStatus } from '../../generated/prisma/enums';
import { allowedTicketStatusTransitions } from './tickets.constants';
import { TicketsError } from './tickets.error';

export function isAllowedTicketStatusTransition(
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  if (from === to) {
    return true;
  }
  return allowedTicketStatusTransitions[from].includes(to);
}

export function assertTicketStatusTransition(
  from: TicketStatus,
  to: TicketStatus,
): void {
  if (!isAllowedTicketStatusTransition(from, to)) {
    throw new TicketsError('INVALID_STATUS_TRANSITION');
  }
}
