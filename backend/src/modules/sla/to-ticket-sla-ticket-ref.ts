import type { TicketSlaTicketRef } from './ticket-sla.types';

export function toTicketSlaTicketRef(ticket: TicketSlaTicketRef): TicketSlaTicketRef {
  return {
    id: ticket.id,
    status: ticket.status,
    priority: ticket.priority,
    serviceId: ticket.serviceId,
    originUnitId: ticket.originUnitId,
    createdAt: ticket.createdAt,
    firstResponseAt: ticket.firstResponseAt,
    resolvedAt: ticket.resolvedAt,
  };
}
