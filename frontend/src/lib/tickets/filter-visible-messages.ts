import type {
  MessageType,
  TicketMessageResponse,
} from "@/services/tickets-collaboration-api";

const staffOnlyMessageTypes: readonly MessageType[] = [
  "INTERNAL_NOTE",
  "SYSTEM_EVENT",
  "APPROVAL_DECISION",
];

/**
 * Defence in depth for requesters: the server already withholds internal
 * notes and system events from them, but a message can still reach the client
 * over a realtime room the person joined for another reason (for example,
 * membership of the ticket's handler group). Those are dropped here.
 */
export function filterVisibleMessages(
  messages: readonly TicketMessageResponse[],
  canSeeStaffMessages: boolean,
): readonly TicketMessageResponse[] {
  return canSeeStaffMessages
    ? messages
    : messages.filter((message) => !staffOnlyMessageTypes.includes(message.type));
}
