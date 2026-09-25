import type { TicketMessageRecord } from '../collaboration.types';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketRealtimeHub } from '../ticket-realtime.hub';
import { toTicketUpdatedPayload } from '../to-ticket-updated-payload';
import type { TicketRecord } from '../tickets.types';

/**
 * The regular `ticket.updated` goes to the NEW group's room. The group the
 * ticket left (and its previous assignee) must refresh their inbox/list too,
 * so the same staff-only change is published once more addressed to them.
 */
export function publishPreviousGroupFeed(
  hub: TicketRealtimeHub,
  ticket: TicketRecord,
  messages: readonly TicketMessageRecord[],
  before: {
    readonly assignedGroupId: string | null;
    readonly assignedUserId: string | null;
  } | null,
): void {
  if (before === null) {
    return;
  }
  const message = messages.find((item) =>
    item.body.startsWith(ticketSystemEventActions.forwarded),
  );
  const payload =
    message === undefined ? null : toTicketUpdatedPayload(message, ticket);
  if (payload === null) {
    return;
  }
  const groupChanged =
    before.assignedGroupId !== null &&
    before.assignedGroupId !== ticket.assignedGroupId;
  const userChanged =
    before.assignedUserId !== null &&
    before.assignedUserId !== ticket.assignedUserId;
  if (!groupChanged && !userChanged) {
    return;
  }
  hub.publishTicketUpdated({
    ...payload,
    visibility: 'staff',
    assignedGroupId: groupChanged ? before.assignedGroupId : null,
    assignedUserId: userChanged ? before.assignedUserId : null,
  });
}
