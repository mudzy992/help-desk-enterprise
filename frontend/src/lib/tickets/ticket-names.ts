import type { TicketResponse } from "@/services/tickets-api";

/** First candidate that is a non-empty name, or null. */
export function pickName(
  ...candidates: readonly (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim() ?? "";
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

export function ticketRequesterName(
  ticket: TicketResponse,
  userNames: ReadonlyMap<string, string>,
): string | null {
  return pickName(ticket.requesterName, userNames.get(ticket.requesterId));
}

export function ticketAssigneeName(
  ticket: TicketResponse,
  userNames: ReadonlyMap<string, string>,
): string | null {
  return ticket.assignedUserId === null
    ? null
    : pickName(ticket.assignedUserName, userNames.get(ticket.assignedUserId));
}

export function ticketGroupName(
  ticket: TicketResponse,
  groupNames: ReadonlyMap<string, string>,
): string | null {
  return ticket.assignedGroupId === null
    ? null
    : pickName(ticket.assignedGroupName, groupNames.get(ticket.assignedGroupId));
}

export function groupNamesFromTickets(
  tickets: readonly TicketResponse[],
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const ticket of tickets) {
    const name = pickName(ticket.assignedGroupName);
    if (ticket.assignedGroupId !== null && name !== null) {
      names.set(ticket.assignedGroupId, name);
    }
  }
  return names;
}
