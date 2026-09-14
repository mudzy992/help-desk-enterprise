import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { canManageTicketsInScope } from './authorize-ticket-actor';
import { isConfidentialTicketVisible } from './confidential/assert-confidential-ticket-access';
import { defaultTicketConfidentialConfiguration } from './confidential/confidential.constants';
import { TicketsError } from './tickets.error';
import type {
  ListTicketsQuery,
  TicketMutationContext,
  TicketRecord,
} from './tickets.types';
import type { TicketArchiveConfiguration } from './archive/archive.types';
import { defaultTicketArchiveConfiguration } from './archive/archive.constants';
import { matchesTicketListSearchQuery } from './matches-list-search-query';

export async function listTickets(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  query: ListTicketsQuery,
  context: TicketMutationContext,
  archive: TicketArchiveConfiguration = defaultTicketArchiveConfiguration,
): Promise<readonly TicketRecord[]> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  if (
    query.status === 'ARCHIVED' &&
    !archive.searchable &&
    !authContext.isSuperAdmin
  ) {
    return [];
  }
  const records = ((await prisma.ticket.findMany({
    where: {
      ...(query.originUnitId === undefined
        ? {}
        : { originUnitId: query.originUnitId }),
      ...(query.serviceId === undefined ? {} : { serviceId: query.serviceId }),
      ...(query.assignedUserId === undefined
        ? {}
        : { assignedUserId: query.assignedUserId }),
      ...(query.priority === undefined ? {} : { priority: query.priority }),
      ...ticketStatusWhere(query),
    },
    orderBy: { createdAt: 'desc' },
  })) as TicketRecord[]).filter((ticket) =>
    matchesTicketListSearchQuery(ticket, query.q),
  );
  const units = await prisma.organizationalUnit.findMany({
    select: { id: true, ouPath: true },
  });
  const pathById = new Map(units.map((unit) => [unit.id, unit.ouPath]));
  const visible: TicketRecord[] = [];
  for (const ticket of records) {
    if (
      await isListedTicketVisible(prisma, authContext, ticket, pathById, context)
    ) {
      visible.push(ticket);
    }
  }
  return visible;
}

async function isListedTicketVisible(
  prisma: PrismaService,
  context: AuthorizationContext,
  ticket: TicketRecord,
  pathById: ReadonlyMap<string, string>,
  mutation: TicketMutationContext,
): Promise<boolean> {
  if (!passesBaselineListVisibility(context, ticket, pathById)) {
    return false;
  }
  const originUnitPath = pathById.get(ticket.originUnitId);
  if (originUnitPath === undefined) {
    return false;
  }
  return isConfidentialTicketVisible(prisma, {
    context,
    ticket,
    originUnitPath,
    configuration:
      mutation.confidential ?? defaultTicketConfidentialConfiguration,
  });
}

function passesBaselineListVisibility(
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

function ticketStatusWhere(query: ListTicketsQuery): {
  status?: ListTicketsQuery['status'] | { not: 'ARCHIVED' };
} {
  if (query.status !== undefined) {
    return { status: query.status };
  }
  if (query.includeArchived === true) {
    return {};
  }
  return { status: { not: 'ARCHIVED' } };
}
