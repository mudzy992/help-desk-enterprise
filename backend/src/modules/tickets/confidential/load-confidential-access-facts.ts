import { permissionKeys } from '../../authorization/authorization.constants';
import { decideAuthorizationAccess } from '../../authorization/evaluate-authorization-access';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { canManageTicketsInScope } from '../authorize-ticket-actor';
import type { TicketRecord } from '../tickets.types';
import {
  actorHasBreakGlassRole,
} from './evaluate-confidential-ticket-access';
import type {
  BreakGlassEventRecord,
  ConfidentialAccessFacts,
  TicketConfidentialConfiguration,
  TicketConfidentialGrantRecord,
} from './confidential.types';

export async function loadConfidentialAccessFacts(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly ticket: TicketRecord;
    readonly originUnitPath: string;
    readonly configuration: TicketConfidentialConfiguration;
    readonly now?: Date;
  },
): Promise<ConfidentialAccessFacts> {
  const actorUserId = input.context.subjectId;
  const memberships = await prisma.groupMember.findMany({
    where: { userId: actorUserId },
    select: { groupId: true },
  });
  const actorGroupIds = memberships.map((membership) => membership.groupId);
  const [grants, breakGlassEvents, participant] = await Promise.all([
    prisma.ticketConfidentialGrant.findMany({
      where: { ticketId: input.ticket.id },
    }) as Promise<TicketConfidentialGrantRecord[]>,
    prisma.breakGlassEvent.findMany({
      where: { ticketId: input.ticket.id, actorUserId },
    }) as Promise<BreakGlassEventRecord[]>,
    prisma.ticketParticipant.findFirst({
      where: { ticketId: input.ticket.id, userId: actorUserId },
      select: { id: true },
    }),
  ]);
  const now = input.now ?? new Date();
  const inScope = canManageTicketsInScope({
    context: input.context,
    originUnitId: input.ticket.originUnitId,
    originUnitPath: input.originUnitPath,
    serviceId: input.ticket.serviceId,
  });
  return {
    isRequester: actorUserId === input.ticket.requesterId,
    isAssignee: input.ticket.assignedUserId === actorUserId,
    isHandlerGroupMember:
      input.ticket.assignedGroupId !== null &&
      actorGroupIds.includes(input.ticket.assignedGroupId),
    isExplicitParticipant: participant !== null,
    hasUserGrant: grants.some((grant) => grant.userId === actorUserId),
    hasGroupGrant: grants.some(
      (grant) =>
        grant.groupId !== null && actorGroupIds.includes(grant.groupId),
    ),
    hasAllowedViewerRole:
      inScope &&
      input.context.assignments.some((assignment) =>
        input.configuration.allowedViewerRoles.includes(assignment.roleKey),
      ),
    hasAllowedViewerGroup:
      inScope &&
      actorGroupIds.some((groupId) =>
        input.configuration.allowedViewerGroupIds.includes(groupId),
      ),
    hasActiveBreakGlass: breakGlassEvents.some((event) =>
      isActiveBreakGlass(event, now),
    ),
    canInvokeBreakGlass: canInvokeBreakGlass({
      context: input.context,
      ticket: input.ticket,
      originUnitPath: input.originUnitPath,
      configuration: input.configuration,
    }),
  };
}

export function canInvokeBreakGlass(input: {
  readonly context: AuthorizationContext;
  readonly ticket: TicketRecord;
  readonly originUnitPath: string;
  readonly configuration: TicketConfidentialConfiguration;
}): boolean {
  if (!input.configuration.breakGlassEnabled) {
    return false;
  }
  if (
    !actorHasBreakGlassRole(
      input.context,
      input.configuration.breakGlassAllowedRoles,
    )
  ) {
    return false;
  }
  return decideAuthorizationAccess({
    context: input.context,
    requiredRoles: [],
    requiredPermissions: [permissionKeys.confidentialBreakGlass],
    organizationalUnitId: input.ticket.originUnitId,
    organizationalUnitPath: input.originUnitPath,
    serviceId: input.ticket.serviceId,
    requireOrganizationalUnitScope: true,
    requireServiceScope: true,
  }).allowed;
}

export function isActiveBreakGlass(
  event: BreakGlassEventRecord,
  now: Date,
): boolean {
  return event.expiresAt === null || event.expiresAt.getTime() > now.getTime();
}
