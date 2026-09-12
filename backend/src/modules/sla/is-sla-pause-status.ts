import type { TicketStatus } from '../../generated/prisma/enums';
import type { SlaConfiguration } from './sla.types';

export function isSlaPauseStatus(
  status: TicketStatus,
  configuration: SlaConfiguration,
): boolean {
  if (status === 'WAITING_FOR_USER') {
    return configuration.pauseOnWaitingForUser;
  }
  if (status === 'PENDING_APPROVAL') {
    return configuration.pauseOnPendingApproval;
  }
  return false;
}

export function isSlaTerminalStatus(status: TicketStatus): boolean {
  return status === 'RESOLVED' || status === 'CLOSED' || status === 'ARCHIVED';
}

export function isSlaFirstResponseStatus(status: TicketStatus): boolean {
  return status === 'IN_PROGRESS';
}
