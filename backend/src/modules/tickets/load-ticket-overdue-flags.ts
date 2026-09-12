import { PrismaService } from '../../common/prisma/prisma.service';
import { isTicketSlaOverdue } from '../sla/is-ticket-sla-overdue';

type TicketSlaOverdueRow = {
  readonly ticketId: string;
  readonly isResponseBreached: boolean;
  readonly isResolutionBreached: boolean;
};

export async function loadTicketOverdueFlags(
  prisma: PrismaService,
  ticketIds: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  if (ticketIds.length === 0) {
    return new Map();
  }
  const rows = (await prisma.ticketSlaState.findMany({
    where: { ticketId: { in: [...ticketIds] } },
  })) as TicketSlaOverdueRow[];
  return new Map(
    rows.map((row) => [row.ticketId, isTicketSlaOverdue(row)]),
  );
}
