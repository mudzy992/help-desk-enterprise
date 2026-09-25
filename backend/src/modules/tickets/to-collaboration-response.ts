import type {
  TicketMessageRecord,
  TicketMessageResponse,
  TicketParticipantRecord,
  TicketParticipantResponse,
  TicketRealtimeMessagePayload,
  TicketTimeLogRecord,
  TicketTimeLogResponse,
} from './collaboration.types';
import type { RedactionMatch } from './redaction/redaction.types';
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
  redactionWarnings?: readonly RedactionMatch[],
): TicketMessageResponse {
  return {
    id: record.id,
    ticketId: record.ticketId,
    type: record.type,
    body: record.body,
    authorUserId: record.authorUserId,
    createdAt: record.createdAt.toISOString(),
    redactionWarnings,
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
    source: record.source ?? 'TIMER',
    stopReason: record.stopReason ?? (record.endedAt === null ? null : 'MANUAL'),
    note: record.note ?? null,
    correctedAt: record.correctedAt?.toISOString() ?? null,
    correctedByUserId: record.correctedByUserId ?? null,
    correctionReason: record.correctionReason ?? null,
    deletedAt: record.deletedAt?.toISOString() ?? null,
    deletedByUserId: record.deletedByUserId ?? null,
    deleteReason: record.deleteReason ?? null,
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
