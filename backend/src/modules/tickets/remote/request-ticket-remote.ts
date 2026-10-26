import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { ticketSystemEventActions } from '../collaboration.constants';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import { findLatestRemoteRequestAt } from './find-latest-remote-request-at';
import { isRemoteRequestRateLimited } from './is-remote-request-rate-limited';
import type { TicketRemoteRequestResult } from './remote.types';

export async function requestTicketRemote(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
  configuration: {
    readonly enabled: boolean;
    readonly rateLimitMinutes: number;
  },
): Promise<TicketRemoteRequestResult> {
  if (!configuration.enabled) {
    throw new TicketsError('REMOTE_DISABLED');
  }
  const { ticket, access } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    { writable: true },
  );
  if (access.visibility !== 'staff') {
    throw new TicketsError('FORBIDDEN');
  }
  const message = await prisma.$transaction(async (transaction) => {
    // Serialize the read-window-claim sequence on the stable parent row. This
    // avoids a bucket table/migration while allowing unrelated tickets to run
    // concurrently. PostgreSQL releases the row lock with the transaction.
    if (typeof transaction.$queryRaw === 'function') {
      await transaction.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticket.id} FOR UPDATE`;
    }
    const lastRequestedAt = await findLatestRemoteRequestAt(
      transaction as PrismaService,
      ticket.id,
    );
    if (
      isRemoteRequestRateLimited(
        lastRequestedAt,
        configuration.rateLimitMinutes,
      )
    ) {
      throw new TicketsError('REMOTE_RATE_LIMITED');
    }
    return insertSystemTicketEvent(transaction as PrismaService, {
      ticketId: ticket.id,
      action: ticketSystemEventActions.remoteRequested,
      actorUserId: context.actorUserId,
    });
  });
  return {
    ticketId: ticket.id,
    requestedAt: message.createdAt.toISOString(),
    rateLimitMinutes: configuration.rateLimitMinutes,
    message,
  };
}
