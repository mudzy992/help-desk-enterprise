import type { TicketStatus } from '../../generated/prisma/enums';
import { ticketSystemEventActions } from './collaboration.constants';

export function ticketStatusChangeSystemEvent(
  from: TicketStatus,
  to: TicketStatus,
): string | null {
  if (from === to) {
    return null;
  }
  if (to === 'WAITING_FOR_USER') {
    return ticketSystemEventActions.waitingForUserEntered;
  }
  if (to === 'RESOLVED') {
    return ticketSystemEventActions.resolved;
  }
  if (to === 'CLOSED') {
    return ticketSystemEventActions.closed;
  }
  return null;
}
