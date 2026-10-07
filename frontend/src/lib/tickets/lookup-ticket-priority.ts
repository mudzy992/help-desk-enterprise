import type { TicketImpact, TicketPriority, TicketUrgency } from "@/services/tickets-api";
import type { PriorityMatrixCell } from "@/services/priority-matrix-api";

/**
 * 5.2.2 (M7 #8): ticket priority comes exclusively from the backend priority
 * matrix. The old local impact+urgency score fallback is removed so changing
 * priority bands on the server does not drift from what the UI shows. Before
 * the matrix has loaded we return a stable MEDIUM placeholder only for initial
 * rendering; once the matrix arrives every 4x4 cell is present so the lookup
 * always matches a server-provided value.
 */
const PRIORITY_MATRIX_LOADING_PLACEHOLDER: TicketPriority = "MEDIUM";

export function lookupTicketPriority(
  impact: TicketImpact,
  urgency: TicketUrgency,
  cells: readonly PriorityMatrixCell[] | null | undefined,
): TicketPriority {
  const match = cells?.find(
    (cell) => cell.impact === impact && cell.urgency === urgency,
  );
  return match?.priority ?? PRIORITY_MATRIX_LOADING_PLACEHOLDER;
}
