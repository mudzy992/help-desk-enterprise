import type {
  TicketMessageRecord,
  TicketMessageResponse,
  TicketParticipantRecord,
  TicketParticipantResponse,
  TicketRealtimeMessagePayload,
  TicketTimeLogRecord,
  TicketTimeLogResponse,
} from './collaboration.types';
import { ticketMessageVisibility } from './ticket-message-visibility';
import type { TicketRecord } from './tickets.types';

export function toTicketParticipantResponse(
  record: TicketParticipantRecord,
): TicketParticipantResponse {
  return {
    id: record.id,
    ticketId: record.ticketId,
    role: record.role,
    userId: record.userId,
    groupId: record.groupId,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toTicketMessageResponse(
  record: TicketMessageRecord,
): TicketMessageResponse {
  return {
    id: record.id,
    ticketId: record.ticketId,
    type: record.type,
    body: record.body,
    authorUserId: record.authorUserId,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toTicketTimeLogResponse(
  record: TicketTimeLogRecord,
): TicketTimeLogResponse {
  return {
    id: record.id,
    ticketId: record.ticketId,
    userId: record.userId,
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    durationSeconds: record.durationSeconds,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toTicketRealtimePayload(
  message: TicketMessageRecord,
  ticket: TicketRecord,
): TicketRealtimeMessagePayload {
  return {
    ...toTicketMessageResponse(message),
    requesterId: ticket.requesterId,
    assignedGroupId: ticket.assignedGroupId,
    visibility: ticketMessageVisibility(message.type),
  };
}
