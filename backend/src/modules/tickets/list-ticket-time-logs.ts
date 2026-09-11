import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import type { TicketTimeLogResponse } from './collaboration.types';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { isTicketStaffActor } from './resolve-ticket-actor-access';
import { TicketsError } from './tickets.error';
import { toTicketTimeLogResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';

export async function listTicketTimeLogs(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<readonly TicketTimeLogResponse[]> {
  const { ticket } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  if (
    !isTicketStaffActor({
      context: authContext,
      originUnitId: ticket.originUnitId,
      originUnitPath,
      serviceId: ticket.serviceId,
    })
  ) {
    throw new TicketsError('FORBIDDEN');
  }
  const records = await prisma.ticketTimeLog.findMany({
    where: { ticketId },
    orderBy: { startedAt: 'asc' },
  });
  return records.map(toTicketTimeLogResponse);
}
