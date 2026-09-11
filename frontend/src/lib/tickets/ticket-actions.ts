import {
  allowedTicketStatusTransitions,
  claimableTicketStatuses,
} from "@/lib/tickets/ticket-constants";
import type { TicketStatus, TicketResponse } from "@/services/tickets-api";

export function nextTicketStatuses(status: TicketStatus): readonly TicketStatus[] {
  return allowedTicketStatusTransitions[status];
}

export function canShowClaimAction(ticket: TicketResponse): boolean {
  return (
    ticket.assignedUserId === null &&
    ticket.assignedGroupId !== null &&
    claimableTicketStatuses.includes(ticket.status)
  );
}

export function isUnassignedWork(ticket: TicketResponse): boolean {
  return ticket.assignedUserId === null;
}
