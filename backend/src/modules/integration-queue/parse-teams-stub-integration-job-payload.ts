import type { TeamsStubIntegrationJobPayload } from './integration-queue.types';

export function parseTeamsStubIntegrationJobPayload(
  value: unknown,
): TeamsStubIntegrationJobPayload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.eventType !== 'string' ||
    typeof record.event !== 'string' ||
    typeof record.ticketId !== 'string' ||
    typeof record.messageId !== 'string' ||
    record.eventType.trim().length === 0 ||
    record.event.trim().length === 0 ||
    record.ticketId.trim().length === 0 ||
    record.messageId.trim().length === 0
  ) {
    return null;
  }
  return {
    eventType: record.eventType,
    event: record.event,
    ticketId: record.ticketId,
    messageId: record.messageId,
  };
}
