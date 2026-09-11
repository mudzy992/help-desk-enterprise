import type {
  TicketImpact,
  TicketPriority,
  TicketUrgency,
} from '../../generated/prisma/enums';
import { ticketSeverityRank } from './tickets.constants';

export function calculateTicketPriority(
  impact: TicketImpact,
  urgency: TicketUrgency,
): TicketPriority {
  const score = ticketSeverityRank[impact] + ticketSeverityRank[urgency];
  if (score <= 2) {
    return 'LOW';
  }
  if (score <= 4) {
    return 'MEDIUM';
  }
  if (score <= 6) {
    return 'HIGH';
  }
  return 'CRITICAL';
}
