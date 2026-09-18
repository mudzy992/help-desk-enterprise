import type { TicketImpact, TicketPriority, TicketUrgency } from "@/services/tickets-api";
import { calculateTicketPriority } from "@/lib/tickets/calculate-ticket-priority";
import type { PriorityMatrixCell } from "@/services/priority-matrix-api";

export function lookupTicketPriority(
  impact: TicketImpact,
  urgency: TicketUrgency,
  cells: readonly PriorityMatrixCell[] | null | undefined,
): TicketPriority {
  const match = cells?.find(
    (cell) => cell.impact === impact && cell.urgency === urgency,
  );
  if (match !== undefined) {
    return match.priority;
  }
  return calculateTicketPriority(impact, urgency);
}
