import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import { priorityLockedTicketStatuses } from './merge.constants';

/** M3: a merged child is read-only until it is unmerged. */
export function assertTicketNotMerged(ticket: Pick<TicketRecord, 'mergedIntoTicketId'>): void {
  if (ticket.mergedIntoTicketId !== null) {
    throw new TicketsError('TICKET_MERGED');
  }
}

/** P2: no priority change on a merged, closed or archived ticket. */
export function assertPriorityEditable(
  ticket: Pick<TicketRecord, 'mergedIntoTicketId' | 'status'>,
): void {
  assertTicketNotMerged(ticket);
  if (priorityLockedTicketStatuses.includes(ticket.status)) {
    throw new TicketsError('TICKET_NOT_EDITABLE');
  }
}
