import { PrismaService } from '../../common/prisma/prisma.service';
import { isTicketSlaOverdue } from '../sla/is-ticket-sla-overdue';
import { loadTicketSlaSnapshots } from './load-ticket-sla-snapshots';

export async function loadTicketOverdueFlags(
  prisma: PrismaService,
  ticketIds: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  const snapshots = await loadTicketSlaSnapshots(prisma, ticketIds);
  return new Map(
    [...snapshots.entries()].map(([ticketId, snapshot]) => [
      ticketId,
      isTicketSlaOverdue(snapshot),
    ]),
  );
}
