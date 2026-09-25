import type { TicketMessageRecord } from './collaboration.types';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { toTicketRealtimePayload } from './to-collaboration-response';
import { toTicketUpdatedPayload } from './to-ticket-updated-payload';
import type { TicketRecord } from './tickets.types';

/**
 * Package 1.2: one operation can write messages on several tickets (a merge
 * writes on the parent and every child; a parent's resolve is copied to its
 * children). Each message must be published with the data of *its* ticket, so
 * the requester and handler group of the child get the child's events. Writers
 * register the other tickets on the sink; unregistered messages keep using the
 * ticket passed to the publisher, as before.
 */
const ticketsBySink = new WeakMap<object, Map<string, TicketRecord>>();

export function registerMessageTicket(
  messages: readonly TicketMessageRecord[],
  ticket: TicketRecord,
): void {
  const known = ticketsBySink.get(messages) ?? new Map<string, TicketRecord>();
  known.set(ticket.id, ticket);
  ticketsBySink.set(messages, known);
}

export function publishPersistedTicketMessages(
  hub: TicketRealtimeHub,
  ticket: TicketRecord,
  messages: readonly TicketMessageRecord[],
): void {
  const known = ticketsBySink.get(messages);
  for (const message of messages) {
    const owner =
      message.ticketId === ticket.id
        ? ticket
        : (known?.get(message.ticketId) ?? ticket);
    hub.publish(toTicketRealtimePayload(message, owner));
    const updated = toTicketUpdatedPayload(message, owner);
    if (updated !== null) {
      hub.publishTicketUpdated(updated);
    }
  }
}
