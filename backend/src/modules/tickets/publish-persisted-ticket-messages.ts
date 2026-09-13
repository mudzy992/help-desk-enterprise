import type { TicketMessageRecord } from './collaboration.types';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { toTicketRealtimePayload } from './to-collaboration-response';
import { toTicketUpdatedPayload } from './to-ticket-updated-payload';
import type { TicketRecord } from './tickets.types';

export function publishPersistedTicketMessages(
  hub: TicketRealtimeHub,
  ticket: TicketRecord,
  messages: readonly TicketMessageRecord[],
): void {
  for (const message of messages) {
    hub.publish(toTicketRealtimePayload(message, ticket));
    const updated = toTicketUpdatedPayload(message, ticket);
    if (updated !== null) {
      hub.publishTicketUpdated(updated);
    }
  }
}
