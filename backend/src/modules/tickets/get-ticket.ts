import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { assertTicketVisible } from './authorize-ticket-actor';
import { loadTicketRecord } from './load-ticket-record';
import { TicketsError } from './tickets.error';
import type { TicketMutationContext, TicketRecord } from './tickets.types';

export async function getTicket(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<TicketRecord> {
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
  assertTicketVisible({
    context: authContext,
    requesterId: ticket.requesterId,
    originUnitId: ticket.originUnitId,
    originUnitPath,
    serviceId: ticket.serviceId,
  });
  return ticket;
}
