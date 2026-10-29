import {
  staffSelectableTicketStatusTransitions,
  claimableTicketStatuses,
} from "@/lib/tickets/ticket-constants";
import type { TicketStatus, TicketResponse } from "@/services/tickets-api";

export function nextTicketStatuses(status: TicketStatus): readonly TicketStatus[] {
  return staffSelectableTicketStatusTransitions[status];
}

export function canShowClaimAction(ticket: TicketResponse, actorIsStaff = true): boolean {
  return (
    actorIsStaff &&
    ticket.assignedUserId === null &&
    ticket.assignedGroupId !== null &&
    claimableTicketStatuses.includes(ticket.status)
  );
}

export function canShowReopenAction(ticket: TicketResponse): boolean {
  return ticket.reopen?.eligible === true;
}
