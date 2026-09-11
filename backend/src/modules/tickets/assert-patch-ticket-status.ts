import type { TicketStatus } from '../../generated/prisma/enums';
import { TicketsError } from './tickets.error';
import { canChangeTicketStatus } from './authorize-ticket-actor';
import { assertTicketStatusTransition } from './assert-ticket-status-transition';
import type { AuthorizationContext } from '../authorization/authorization.types';

export function assertPatchTicketStatus(input: {
  readonly context: AuthorizationContext;
  readonly from: TicketStatus;
  readonly to: TicketStatus;
}): void {
  if (input.from === input.to) {
    return;
  }
  if (!canChangeTicketStatus(input.context)) {
    throw new TicketsError('STATUS_CHANGE_FORBIDDEN');
  }
  if (input.from === 'PENDING_APPROVAL') {
    throw new TicketsError('APPROVAL_DECISION_REQUIRED');
  }
  if (input.to === 'PENDING_APPROVAL') {
    throw new TicketsError('APPROVAL_TRANSITION_FORBIDDEN');
  }
  if (input.to === 'IN_PROGRESS' && isReopenSourceStatus(input.from)) {
    throw new TicketsError('REOPEN_REQUIRED');
  }
  assertTicketStatusTransition(input.from, input.to);
}

function isReopenSourceStatus(status: TicketStatus): boolean {
  return status === 'RESOLVED' || status === 'CLOSED';
}
