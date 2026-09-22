import type { AutoAssignStrategy } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { RoutingService } from '../../routing/routing.service';
import { routingOutcomes } from '../../routing/routing.constants';
import { resolveEffectiveAutoAssignStrategy } from '../assignment/resolve-effective-auto-assign-strategy';
import { TicketAssignmentConfigurationLoader } from '../assignment/ticket-assignment-configuration.loader';
import { resolveTicketApprovalRequirement } from '../approvals/resolve-ticket-approval-requirement';
import type { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { assertCanCreateTicket, resolveCreateOriginUnitId } from '../assert-can-create-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import type { TicketRoutingPreview } from './routing-preview.types';

/**
 * The same routing decision `POST /tickets` would make, without creating
 * anything and without leaking internal rule or unit ids: `outcome`,
 * `groupName`, `fallbackDepth`, `autoAssign`, `approvalSteps`,
 * `slaProfileName`. Uses `RoutingService.resolve`, the one place routing is
 * decided, so preview and create can never disagree.
 *
 * Gated the same way ticket creation is (`assertCanCreateTicket`): a
 * requester previewing an OU/service they could not actually submit to would
 * otherwise learn which group handles it.
 */
export async function previewTicketRouting(
  prisma: PrismaService,
  routingService: RoutingService,
  authorizationContextLoader: AuthorizationContextLoader,
  approvalsConfigurationLoader: TicketApprovalsConfigurationLoader,
  assignmentConfigurationLoader: TicketAssignmentConfigurationLoader,
  input: { readonly originUnitId?: string; readonly serviceId: string },
  context: TicketMutationContext,
): Promise<TicketRoutingPreview> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const actor = await prisma.user.findUnique({
    where: { id: context.actorUserId },
    select: { organizationalUnitId: true },
  });
  const originUnitId = await resolveCreateOriginUnitId(prisma, {
    requestedOriginUnitId: input.originUnitId,
    actorUserId: context.actorUserId,
  });
  const serviceId = input.serviceId.trim();
  if (serviceId.length === 0) {
    throw new TicketsError('SERVICE_REQUIRED');
  }
  await assertCanCreateTicket({
    prisma,
    context: authContext,
    originUnitId,
    serviceId,
    actorHomeUnitId: actor?.organizationalUnitId ?? null,
  });
  const [resolution, service, assignmentConfiguration] = await Promise.all([
    routingService.resolve({ originUnitId, serviceId }),
    prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        requiresApproval: true,
        autoAssignStrategy: true,
        slaProfileId: true,
      },
    }),
    assignmentConfigurationLoader.load(),
  ]);
  if (service === null) {
    throw new TicketsError('SERVICE_NOT_FOUND');
  }
  const [group, slaProfile, approvalsConfiguration] = await Promise.all([
    resolution.groupId === null
      ? Promise.resolve(null)
      : prisma.group.findUnique({
          where: { id: resolution.groupId },
          select: { name: true, autoAssignStrategy: true },
        }),
    service.slaProfileId === null
      ? Promise.resolve(null)
      : prisma.slaProfile.findUnique({
          where: { id: service.slaProfileId },
          select: { name: true, isActive: true },
        }),
    approvalsConfigurationLoader.load(),
  ]);
  const autoAssign: AutoAssignStrategy =
    resolution.outcome === routingOutcomes.unrouted
      ? 'NONE'
      : resolveEffectiveAutoAssignStrategy({
          configuration: assignmentConfiguration,
          serviceStrategy: service.autoAssignStrategy as AutoAssignStrategy,
          groupStrategy: group?.autoAssignStrategy as
            | AutoAssignStrategy
            | undefined,
        });
  const requiresApproval = resolveTicketApprovalRequirement({
    configuration: approvalsConfiguration,
    serviceId,
    serviceRequiresApproval: service.requiresApproval,
  });
  return {
    outcome: resolution.outcome,
    groupName: group?.name ?? null,
    fallbackDepth: resolution.fallbackDepth,
    autoAssign,
    approvalSteps: requiresApproval ? 1 : 0,
    slaProfileName: slaProfile?.isActive === true ? slaProfile.name : null,
  };
}
