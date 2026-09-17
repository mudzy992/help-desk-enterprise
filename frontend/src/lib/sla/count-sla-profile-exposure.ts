import type { TicketPriority, TicketResponse } from "@/services/tickets-api";

const TERMINAL_STATUSES = new Set(["RESOLVED", "CLOSED", "ARCHIVED"]);

export type SlaExposureCounts = {
  readonly open: number;
  readonly atRisk: number;
  readonly breached: number;
};

export function isOpenSlaTrackedTicket(ticket: TicketResponse): boolean {
  return !TERMINAL_STATUSES.has(ticket.status) && ticket.sla != null;
}

export function countOpenTicketsForSlaProfile(
  tickets: readonly TicketResponse[],
  slaProfileId: string,
): number {
  return tickets.filter(
    (ticket) =>
      isOpenSlaTrackedTicket(ticket) && ticket.sla?.slaProfileId === slaProfileId,
  ).length;
}

export function countSlaPriorityExposure(
  tickets: readonly TicketResponse[],
  slaProfileId: string,
  priority: TicketPriority,
): SlaExposureCounts {
  const matching = tickets.filter(
    (ticket) =>
      isOpenSlaTrackedTicket(ticket) &&
      ticket.sla?.slaProfileId === slaProfileId &&
      ticket.priority === priority,
  );
  let atRisk = 0;
  let breached = 0;
  for (const ticket of matching) {
    if (ticket.isOverdue === true) {
      breached += 1;
      continue;
    }
    if (ticket.isAtRisk === true) {
      atRisk += 1;
    }
  }
  return { open: matching.length, atRisk, breached };
}
