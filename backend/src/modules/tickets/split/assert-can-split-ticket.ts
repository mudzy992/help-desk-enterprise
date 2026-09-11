import type { AuthorizationContext } from '../../authorization/authorization.types';
import { canChangeTicketStatus } from '../authorize-ticket-actor';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import { ticketSplitConstants } from './split.constants';
import type { SplitTicketChildInput } from './split.types';

export function assertCanSplitTicket(input: {
  readonly context: AuthorizationContext;
  readonly ticket: TicketRecord;
  readonly children: readonly SplitTicketChildInput[];
}): void {
  if (!canChangeTicketStatus(input.context)) {
    throw new TicketsError('FORBIDDEN');
  }
  if (
    input.ticket.status === 'ARCHIVED' ||
    input.ticket.mergedIntoTicketId !== null
  ) {
    throw new TicketsError('SPLIT_NOT_ALLOWED');
  }
  if (
    input.children.length < ticketSplitConstants.minimumChildren ||
    input.children.length > ticketSplitConstants.maximumChildren
  ) {
    throw new TicketsError('INVALID_SPLIT_CHILDREN');
  }
}
