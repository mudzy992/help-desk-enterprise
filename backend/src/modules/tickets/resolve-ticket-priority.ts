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

/**
 * M7 B5 (val 5): `matrixEnabled: false` (setting
 * `private.ticket.priorityMatrix.enabled`) skips the table entirely and uses the
 * built-in formula, so an installation can drop the matrix without deleting it.
 * The default keeps every existing caller and test behaving as before.
 */
export async function resolveTicketPriority(
  prisma: PrismaService | PriorityMatrixLookupClient,
  impact: TicketImpact,
  urgency: TicketUrgency,
  options: { readonly matrixEnabled?: boolean } = {},
): Promise<TicketPriority> {
  if (options.matrixEnabled === false) {
    return calculateTicketPriority(impact, urgency);
  }
  const rule = await prisma.priorityMatrixRule.findUnique({
    where: { impact_urgency: { impact, urgency } },
  });
  if (rule !== null) {
    return rule.priority;
  }
  return calculateTicketPriority(impact, urgency);
}
