import type { TicketRealtimeBridgePublish } from './ticket-realtime-bridge.types';

/**
 * Phase 4.1: the bridge carries JSON over Redis, so the API side validates the
 * envelope before it touches the hub. A malformed payload is ignored (and logged
 * by the subscriber) rather than broadcast — the same conservative rule the edge
 * event subscriber follows.
 */
export function parseTicketRealtimeBridgePayload(
  value: unknown,
): TicketRealtimeBridgePublish | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as { readonly kind?: unknown; readonly payload?: unknown };
  if (typeof candidate.payload !== 'object' || candidate.payload === null) {
    return null;
  }
  const payload = candidate.payload as { readonly ticketId?: unknown };
  if (typeof payload.ticketId !== 'string' || payload.ticketId.length === 0) {
    return null;
  }
  if (candidate.kind === 'message') {
    const message = candidate.payload as { readonly id?: unknown };
    if (typeof message.id !== 'string' || message.id.length === 0) {
      return null;
    }
    return { kind: 'message', payload: candidate.payload as never };
  }
  if (candidate.kind === 'updated') {
    const updated = candidate.payload as { readonly change?: unknown };
    if (typeof updated.change !== 'string' || updated.change.length === 0) {
      return null;
    }
    return { kind: 'updated', payload: candidate.payload as never };
  }
  return null;
}
