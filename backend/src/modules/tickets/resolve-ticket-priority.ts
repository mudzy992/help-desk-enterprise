import type { PrismaService } from '../../common/prisma/prisma.service';
import type {
  TicketImpact,
  TicketPriority,
  TicketUrgency,
} from '../../generated/prisma/enums';
import { calculateTicketPriority } from './calculate-ticket-priority';

type PriorityMatrixLookupClient = {
  readonly priorityMatrixRule: {
    findUnique: (args: {
      where: {
        impact_urgency: {
          impact: TicketImpact;
          urgency: TicketUrgency;
        };
      };
    }) => Promise<{ priority: TicketPriority } | null>;
  };
};

export async function resolveTicketPriority(
  prisma: PrismaService | PriorityMatrixLookupClient,
  impact: TicketImpact,
  urgency: TicketUrgency,
): Promise<TicketPriority> {
  const rule = await prisma.priorityMatrixRule.findUnique({
    where: { impact_urgency: { impact, urgency } },
  });
  if (rule !== null) {
    return rule.priority;
  }
  return calculateTicketPriority(impact, urgency);
}
