import type { JsonValue } from '../change-log/change-log.types';
import { describeTicketReopen } from './reopen/resolve-ticket-reopen-policy';
import type { TicketReopenConfiguration } from './reopen/reopen.types';
import type { TicketRecord, TicketResponse } from './tickets.types';

export function toTicketResponse(record: TicketRecord): TicketResponse {
  return {
    id: record.id,
    ticketNumber: record.ticketNumber,
    title: record.title,
    description: record.description,
    status: record.status,
    priority: record.priority,
    impact: record.impact,
    urgency: record.urgency,
    classification: record.classification,
    isConfidential: record.isConfidential,
    formData: toJsonValue(record.formData),
    originUnitId: record.originUnitId,
    serviceId: record.serviceId,
    formVersionRef: record.formVersionId,
    requesterId: record.requesterId,
    assignedGroupId: record.assignedGroupId,
    assignedUserId: record.assignedUserId,
    reopenedFromTicketId: record.reopenedFromTicketId,
    resolvedAt: toIso(record.resolvedAt),
    closedAt: toIso(record.closedAt),
    waitingForUserEnteredAt: toIso(record.waitingForUserEnteredAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toTicketClientResponse(
  record: TicketRecord,
  configuration: TicketReopenConfiguration,
  now = new Date(),
): TicketResponse {
  return {
    ...toTicketResponse(record),
    reopen: describeTicketReopen(record, configuration, now),
  };
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toJsonValue(value: unknown): JsonValue | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
