import type { TicketMessageRecord } from './collaboration.types';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { toTicketRealtimePayload } from './to-collaboration-response';
import type { TicketRecord } from './tickets.types';

export function publishPersistedTicketMessages(
  hub: TicketRealtimeHub,
  ticket: TicketRecord,
  messages: readonly TicketMessageRecord[],
): void {
  for (const message of messages) {
    hub.publish(toTicketRealtimePayload(message, ticket));
  }
}
