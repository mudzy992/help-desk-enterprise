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
    isOverdue:
      payload.change === "sla" &&
      (payload.sourceAction?.includes("breached") ?? false)
        ? true
        : current.isOverdue,
  };
}
