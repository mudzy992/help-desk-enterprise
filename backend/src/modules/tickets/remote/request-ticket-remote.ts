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
  const lastRequestedAt = await findLatestRemoteRequestAt(prisma, ticket.id);
  if (
    isRemoteRequestRateLimited(lastRequestedAt, configuration.rateLimitMinutes)
  ) {
    throw new TicketsError('REMOTE_RATE_LIMITED');
  }
  const message = await insertSystemTicketEvent(prisma, {
    ticketId: ticket.id,
    action: ticketSystemEventActions.remoteRequested,
    actorUserId: context.actorUserId,
  });
  return {
    ticketId: ticket.id,
    requestedAt: message.createdAt.toISOString(),
    rateLimitMinutes: configuration.rateLimitMinutes,
    message,
  };
}
