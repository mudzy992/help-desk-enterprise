import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { canManageTicketsInScope } from '../authorize-ticket-actor';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { TicketAssignmentConfigurationLoader } from './ticket-assignment-configuration.loader';

type InboxGroupWhere = { not: null } | { in: string[] };

export async function listGroupInboxTickets(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configurationLoader: TicketAssignmentConfigurationLoader,
  context: TicketMutationContext,
): Promise<readonly TicketRecord[]> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const configuration = await configurationLoader.load();
  if (!configuration.groupInboxEnabled) {
    throw new TicketsError('GROUP_INBOX_DISABLED');
  }
  const assignedGroupId = await resolveInboxGroupWhere(prisma, authContext);
  if (assignedGroupId === null) {
    return [];
  }
  const records = (await prisma.ticket.findMany({
    where: {
      assignedUserId: null,
      status: 'PENDING',
      assignedGroupId,
    },
    orderBy: { createdAt: 'desc' },
  })) as TicketRecord[];
  const units = await prisma.organizationalUnit.findMany({
    select: { id: true, ouPath: true },
  });
  const pathById = new Map(units.map((unit) => [unit.id, unit.ouPath]));
  return records.filter((ticket) =>
    isInboxTicketVisible(authContext, ticket, pathById),
  );
}

async function resolveInboxGroupWhere(
  prisma: PrismaService,
  context: AuthorizationContext,
): Promise<InboxGroupWhere | null> {
  if (context.isSuperAdmin) {
    return { not: null };
  }
  const memberships = await prisma.groupMember.findMany({
    where: { userId: context.subjectId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((membership) => membership.groupId);
  if (groupIds.length === 0) {
    return null;
  }
  return { in: groupIds };
}

function isInboxTicketVisible(
  context: AuthorizationContext,
  ticket: TicketRecord,
  pathById: ReadonlyMap<string, string>,
): boolean {
  if (ticket.assignedGroupId === null || ticket.assignedUserId !== null) {
    return false;
  }
  if (context.isSuperAdmin) {
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
