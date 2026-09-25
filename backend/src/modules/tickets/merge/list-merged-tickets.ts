import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import type { TicketMutationContext } from '../tickets.types';

export type MergedTicketItem = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly requesterId: string;
  readonly requesterName: string | null;
  readonly mergedAt: string | null;
};

/**
 * Package 1.2, M7 — children of a parent for the "Merged tickets" card.
 * Staff see the list; a requester of the parent (or a MERGED_REQUESTER) gets an
 * empty list: other people's tickets are not theirs to browse.
 */
export async function listMergedTickets(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly ticketId: string;
  readonly context: TicketMutationContext;
}): Promise<readonly MergedTicketItem[]> {
  const { ticket, access } = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
  );
  if (access.visibility !== 'staff') {
    return [];
  }
  const rows = await input.prisma.ticket.findMany({
    where: { mergedIntoTicketId: ticket.id },
    orderBy: { mergedAt: 'asc' },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      requesterId: true,
      mergedAt: true,
      requester: { select: { displayName: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    ticketNumber: row.ticketNumber,
    title: row.title,
    status: row.status,
    requesterId: row.requesterId,
    requesterName: row.requester?.displayName ?? null,
    mergedAt: row.mergedAt?.toISOString() ?? null,
  }));
}
