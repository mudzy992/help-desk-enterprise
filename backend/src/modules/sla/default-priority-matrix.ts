import type {
  TicketImpact,
  TicketPriority,
  TicketUrgency,
} from '../../generated/prisma/enums';
import {
  ticketImpactLevels,
  ticketUrgencyLevels,
} from '../tickets/tickets.constants';
import { calculateTicketPriority } from '../tickets/calculate-ticket-priority';

export type PriorityMatrixCell = {
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly priority: TicketPriority;
};

export function buildDefaultPriorityMatrix(): readonly PriorityMatrixCell[] {
  return ticketImpactLevels.flatMap((impact) =>
    ticketUrgencyLevels.map((urgency) => ({
      impact,
      urgency,
      priority: calculateTicketPriority(impact, urgency),
    })),
  );
}

export function priorityMatrixCellKey(
  impact: TicketImpact,
  urgency: TicketUrgency,
): string {
  return `${impact}:${urgency}`;
}
