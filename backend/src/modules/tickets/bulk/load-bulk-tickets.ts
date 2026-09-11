import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { assertTicketVisible } from '../authorize-ticket-actor';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';

export async function loadBulkTickets(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketIds: readonly string[],
  context: TicketMutationContext,
): Promise<readonly TicketRecord[]> {
  const uniqueIds = [...new Set(ticketIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new TicketsError('NOT_FOUND');
  }
  const records = (await prisma.ticket.findMany({
    where: { id: { in: uniqueIds } },
  })) as TicketRecord[];
  if (records.length !== uniqueIds.length) {
    throw new TicketsError('NOT_FOUND');
  }
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  for (const ticket of records) {
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
  }
  return records;
}
