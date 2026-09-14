import type { TicketImpact, TicketPriority, TicketUrgency } from "@/services/tickets-api";

const SEVERITY_RANK: Readonly<Record<TicketImpact, number>> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Same score bands as `backend/src/modules/tickets/calculate-ticket-priority.ts`. */
export function calculateTicketPriority(
  impact: TicketImpact,
  urgency: TicketUrgency,
): TicketPriority {
  const score = SEVERITY_RANK[impact] + SEVERITY_RANK[urgency];
  if (score <= 2) {
    return "LOW";
  }
  if (score <= 4) {
    return "MEDIUM";
  }
  if (score <= 6) {
    return "HIGH";
  }
  return "CRITICAL";
}
