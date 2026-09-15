import type { TicketResponse, TicketStatus } from "@/services/tickets-api";

const terminalStatuses: ReadonlySet<TicketStatus> = new Set([
  "RESOLVED",
  "CLOSED",
  "ARCHIVED",
]);

export function isReportOpenTicket(
  ticket: Pick<TicketResponse, "status">,
): boolean {
  return !terminalStatuses.has(ticket.status);
}

export function ticketResolvedAt(
  ticket: Pick<TicketResponse, "resolvedAt" | "sla">,
): string | null {
  if (ticket.resolvedAt) {
    return ticket.resolvedAt;
  }
  return ticket.sla?.resolutionCompletedAt ?? null;
}

export function ticketFirstRespondedAt(
  ticket: Pick<TicketResponse, "sla">,
): string | null {
  return ticket.sla?.respondedAt ?? null;
}

export function elapsedHours(startIso: string, endIso: string): number | null {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  return hours < 0 ? null : hours;
}

export function elapsedMinutes(startIso: string, endIso: string): number | null {
  const hours = elapsedHours(startIso, endIso);
  return hours === null ? null : hours * 60;
}

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
