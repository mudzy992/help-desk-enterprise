import type { TicketRecord } from '../tickets.types';
import type { ExportTicketsQuery } from './export.types';

function matchesSearch(ticket: TicketRecord, search: string | undefined): boolean {
  const needle = search?.trim().toLowerCase() ?? '';
  if (needle.length === 0) {
    return true;
  }
  return (
    ticket.ticketNumber.toLowerCase().includes(needle) ||
    ticket.title.toLowerCase().includes(needle) ||
    ticket.description.toLowerCase().includes(needle)
  );
}

/**
 * Applies the list filters that the ticket list evaluates on the client, so
 * the exported file matches what the person sees on screen.
 */
export function filterExportTickets(
  tickets: readonly TicketRecord[],
  query: ExportTicketsQuery,
  overdueByTicketId: ReadonlyMap<string, boolean>,
): readonly TicketRecord[] {
  return tickets.filter((ticket) => {
    if (!matchesSearch(ticket, query.q)) {
      return false;
    }
    if (query.requesterId !== undefined && ticket.requesterId !== query.requesterId) {
      return false;
    }
    if (query.unassigned === true && ticket.assignedUserId !== null) {
      return false;
    }
    if (query.overdue === true && overdueByTicketId.get(ticket.id) !== true) {
      return false;
    }
    const createdAt = ticket.createdAt.toISOString();
    if (query.createdFrom !== undefined && createdAt < query.createdFrom) {
      return false;
    }
    if (query.createdTo !== undefined && createdAt > query.createdTo) {
      return false;
    }
    return true;
  });
}
