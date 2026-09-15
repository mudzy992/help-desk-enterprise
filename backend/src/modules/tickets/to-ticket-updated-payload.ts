import type { TicketMessageRecord } from './collaboration.types';
import {
  isStaffOnlyTicketRealtimeAction,
  mapTicketRealtimeChange,
} from './map-ticket-realtime-change';
import type { TicketUpdatedRealtimePayload } from './ticket-realtime.types';
import type { TicketRecord } from './tickets.types';

export function toTicketUpdatedPayload(
  message: TicketMessageRecord,
  ticket: TicketRecord,
): TicketUpdatedRealtimePayload | null {
  const sourceAction =
    message.type === 'SYSTEM_EVENT' ? message.body : null;
  const change = mapTicketRealtimeChange(message.type, sourceAction);
  if (change === null) {
    return null;
  }
  const visibility = isStaffOnlyTicketRealtimeAction(sourceAction)
    ? 'staff'
    : 'public';
  return {
    ticketId: ticket.id,
    change,
    sourceAction,
    sourceMessageId: message.id,
    status: ticket.status,
    priority: ticket.priority,
    assignedUserId: ticket.assignedUserId,
    assignedGroupId: ticket.assignedGroupId,
    requesterId: ticket.requesterId,
    archivedAt: ticket.archivedAt?.toISOString() ?? null,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    actorUserId: message.authorUserId,
    occurredAt: message.createdAt.toISOString(),
    visibility,
  };
}
