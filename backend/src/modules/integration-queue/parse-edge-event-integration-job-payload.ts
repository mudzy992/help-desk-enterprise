import type { EdgeEventIntegrationJobPayload } from './integration-queue.types';
import type { EdgeEventRealtimePublish } from '../tickets/ticket-realtime.types';

export function parseEdgeEventIntegrationJobPayload(
  value: unknown,
): EdgeEventIntegrationJobPayload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.userId !== 'string' ||
    typeof record.eventName !== 'string' ||
    record.userId.trim().length === 0 ||
    record.eventName.trim().length === 0
  ) {
    return null;
  }
  const ticketId =
    typeof record.ticketId === 'string' && record.ticketId.trim().length > 0
      ? record.ticketId.trim()
      : undefined;
  return {
    userId: record.userId,
    ticketId,
    eventName: record.eventName,
    data: record.data,
  };
}

export function toEdgeEventRealtimePublish(
  payload: EdgeEventIntegrationJobPayload,
): EdgeEventRealtimePublish {
  return {
    userId: payload.userId,
    ticketId: payload.ticketId,
    eventName: payload.eventName,
    data: payload.data,
  };
}
