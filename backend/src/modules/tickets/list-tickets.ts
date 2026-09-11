import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { canManageTicketsInScope } from './authorize-ticket-actor';
import { TicketsError } from './tickets.error';
import type {
  ListTicketsQuery,
  TicketMutationContext,
  TicketRecord,
} from './tickets.types';

export async function listTickets(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  query: ListTicketsQuery,
  context: TicketMutationContext,
): Promise<readonly TicketRecord[]> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const records = (await prisma.ticket.findMany({
    where: {
      ...(query.originUnitId === undefined
        ? {}
        : { originUnitId: query.originUnitId }),
      ...(query.serviceId === undefined ? {} : { serviceId: query.serviceId }),
      ...(query.status === undefined ? {} : { status: query.status }),
    },
    orderBy: { createdAt: 'desc' },
  })) as TicketRecord[];
  const units = await prisma.organizationalUnit.findMany({
    select: { id: true, ouPath: true },
  });
  const pathById = new Map(units.map((unit) => [unit.id, unit.ouPath]));
  return records.filter((ticket) =>
    isListedTicketVisible(authContext, ticket, pathById),
  );
}

function isListedTicketVisible(
  context: AuthorizationContext,
  ticket: TicketRecord,
  pathById: ReadonlyMap<string, string>,
): boolean {
  if (context.isSuperAdmin || context.subjectId === ticket.requesterId) {
    return true;
  }
  const originUnitPath = pathById.get(ticket.originUnitId);
  if (originUnitPath === undefined) {
    return false;
  }
  return canManageTicketsInScope({
    context,
    originUnitId: ticket.originUnitId,
    originUnitPath,
    serviceId: ticket.serviceId,
  });
}
