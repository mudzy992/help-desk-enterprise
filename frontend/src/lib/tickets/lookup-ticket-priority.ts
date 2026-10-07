import type { TicketImpact, TicketPriority, TicketUrgency } from "@/services/tickets-api";
import type { PriorityMatrixCell } from "@/services/priority-matrix-api";

/**
 * 5.2.2 (M7 #8): ticket priority comes exclusively from the backend priority
 * matrix. The old local impact+urgency score fallback is removed so changing
 * priority bands on the server does not drift from what the UI shows. Before
 * the matrix has loaded we fall back to MEDIUM only for placeholder rendering;
 * once the matrix arrives every cell is present so the lookup always matches.
 */
export function lookupTicketPriority(
  impact: TicketImpact,
  urgency: TicketUrgency,
  cells: readonly PriorityMatrixCell[] | null | undefined,
): TicketPriority {
  const match = cells?.find(
    (cell) => cell.impact === impact && cell.urgency === urgency,
  );
  return match?.priority ?? "MEDIUM";
}
