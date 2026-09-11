import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { resolveTicketActorAccess } from './resolve-ticket-actor-access';
import type { TicketActorAccess } from './collaboration.types';
import { loadTicketRecord } from './load-ticket-record';
import { TicketsError } from './tickets.error';
import type { TicketMutationContext, TicketRecord } from './tickets.types';

export async function loadAccessibleTicket(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<{ ticket: TicketRecord; access: TicketActorAccess }> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const ticket = await loadTicketRecord(prisma, ticketId);
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  const access = await resolveTicketActorAccess(prisma, {
    context: authContext,
    ticket,
    originUnitPath,
  });
  return { ticket, access };
}
