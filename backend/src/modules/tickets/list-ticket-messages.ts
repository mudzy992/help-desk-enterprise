import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { staffOnlyMessageTypes } from './collaboration.constants';
import type { TicketMessageResponse } from './collaboration.types';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { canViewTicketMessage } from './ticket-message-visibility';
import { toTicketMessageResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';

export const ticketMessagePageDefault = 1000;
export const ticketMessagePageMax = 1000;

export type ListTicketMessagesOptions = {
  /** Only messages created strictly before this instant (older page). */
  readonly before?: Date;
  readonly take?: number;
};

/**
 * Review 2026-09-25 (S6): all messages were loaded and staff-only ones were
 * filtered in memory. Visibility is now part of the query and the result is
 * the newest `take` (default/max 1000) messages, returned oldest-first as
 * before; `before` pages further back.
 */
export async function listTicketMessages(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
  options: ListTicketMessagesOptions = {},
): Promise<readonly TicketMessageResponse[]> {
  const { access } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const take = Math.min(
    Math.max(1, Math.trunc(options.take ?? ticketMessagePageDefault)),
    ticketMessagePageMax,
  );
  const newestFirst = await prisma.ticketMessage.findMany({
    where: {
      ticketId,
      ...(access.visibility === 'staff'
        ? {}
        : { type: { notIn: [...staffOnlyMessageTypes] } }),
      ...(options.before !== undefined
        ? { createdAt: { lt: options.before } }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
  });
  const records = [...newestFirst].reverse();
  return records
    .filter((record) => canViewTicketMessage(access.visibility, record.type))
    .map((record) => toTicketMessageResponse(record));
}
