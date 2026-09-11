import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { defaultTicketArchiveConfiguration } from './archive.constants';

export function assertTicketWritable(
  ticket: TicketRecord,
  context: TicketMutationContext,
): void {
  if (ticket.status !== 'ARCHIVED') {
    return;
  }
  const configuration = context.archive ?? defaultTicketArchiveConfiguration;
  if (!configuration.archivedReadOnly) {
    return;
  }
  throw new TicketsError('TICKET_ARCHIVED_READ_ONLY');
}
