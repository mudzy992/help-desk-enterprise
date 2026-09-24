import type { TicketResponse } from "@/services/tickets-api";

export type TicketUpdatedRealtimePayload = {
  readonly ticketId: string;
  readonly change: string;
  readonly sourceAction: string | null;
  readonly status: TicketResponse["status"];
  readonly priority: TicketResponse["priority"];
  readonly assignedUserId: string | null;
  readonly assignedGroupId: string | null;
  readonly archivedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly occurredAt: string;
};

/*
  The payload carries status/assignment fields only — it never carries the SLA
  snapshot. Deriving `isOverdue` from the action name used to make the flag
  sticky: once a breach event arrived, the ticket stayed marked as breached for
  the rest of the session, in every later render, even after it was resolved or
  reopened. SLA changes therefore reload the ticket instead (see
  `shouldReloadTicketFromUpdated`), so the badge and the panel always render the
  snapshot the server just computed for that one ticket.
*/
export function applyTicketUpdatedPayload(
  current: TicketResponse | null,
  payload: TicketUpdatedRealtimePayload,
): TicketResponse | null {
  if (current === null || current.id !== payload.ticketId) {
    return current;
  }
  return {
    ...current,
    status: payload.status,
    priority: payload.priority,
    assignedUserId: payload.assignedUserId,
    assignedGroupId: payload.assignedGroupId,
    archivedAt: payload.archivedAt,
    resolvedAt: payload.resolvedAt,
    closedAt: payload.closedAt,
    updatedAt: payload.occurredAt,
  };
}

/** SLA events must be re-read from the server; the payload has no snapshot. */
export function shouldReloadTicketFromUpdated(
  payload: TicketUpdatedRealtimePayload,
): boolean {
  return payload.change === "sla";
}
