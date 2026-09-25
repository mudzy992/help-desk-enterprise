import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { decideAuthorizationAccess } from '../../authorization/evaluate-authorization-access';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { claimableTicketStatuses } from '../assignment/assignment.constants';
import { TicketAssignmentConfigurationLoader } from '../assignment/ticket-assignment-configuration.loader';
import { canChangeTicketStatus } from '../authorize-ticket-actor';
import { forwardableTicketStatuses } from '../forwarding/forwarding.constants';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import type { TicketAllowedActions, TicketComposerAccess } from './context.types';

/**
 * What the signed-in person may do on this ticket, derived from the same
 * predicates the mutating endpoints enforce, so the UI never offers an action
 * the server is going to refuse for role, scope, permission or group reasons.
 * Feature switches (for example split or remote being disabled) are not
 * evaluated here and still surface as their own errors.
 */
export async function resolveTicketAllowedActions(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly assignmentConfigurationLoader: TicketAssignmentConfigurationLoader;
  readonly ticketId: string;
  readonly context: TicketMutationContext;
}): Promise<TicketAllowedActions> {
  const { ticket, access } = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
  );
  const authContext = await input.authorizationContextLoader.loadBySubjectId(
    input.context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    input.prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  const isStaff = access.visibility === 'staff';
  const isRequester = ticket.requesterId === authContext.subjectId;
  const composerAccess: TicketComposerAccess =
    isStaff && isRequester ? 'both' : isStaff ? 'staff' : 'requester';
  const writable = ticket.status !== 'ARCHIVED';
  const staffCanWrite = isStaff && writable;
  const canChangeStatus = staffCanWrite && canChangeTicketStatus(authContext);
  const isGroupMember =
    !staffCanWrite ||
    authContext.isSuperAdmin ||
    ticket.assignedGroupId === null
      ? false
      : (await input.prisma.groupMember.findFirst({
          where: {
            groupId: ticket.assignedGroupId,
            userId: authContext.subjectId,
          },
          select: { id: true },
        })) !== null;
  const configuration = await input.assignmentConfigurationLoader.load();
  const claim =
    canChangeStatus &&
    configuration.groupInboxEnabled &&
    ticket.assignedGroupId !== null &&
    ticket.assignedUserId === null &&
    claimableTicketStatuses.includes(
      ticket.status as (typeof claimableTicketStatuses)[number],
    ) &&
    (authContext.isSuperAdmin || isGroupMember);
  const isAgentOnly = authContext.assignments.every(
    (assignment) => assignment.roleKey === authorizationRoleKeys.agent,
  );
  // Mirrors planTicketForward: forwardable status, not merged, and an
  // AGENT-only actor forwards only work of their own group or assigned to them.
  const forward =
    canChangeStatus &&
    ticket.mergedIntoTicketId === null &&
    (forwardableTicketStatuses as readonly string[]).includes(ticket.status) &&
    (authContext.isSuperAdmin ||
      !isAgentOnly ||
      ticket.assignedGroupId === null ||
      ticket.assignedUserId === authContext.subjectId ||
      isGroupMember);
  const uploadAttachments =
    writable &&
    decideAuthorizationAccess({
      context: authContext,
      requiredRoles: [],
      requiredPermissions: [permissionKeys.ticketAttachmentsUpload],
      organizationalUnitId: ticket.originUnitId,
      organizationalUnitPath: originUnitPath,
      serviceId: ticket.serviceId,
      requireOrganizationalUnitScope: true,
      requireServiceScope: true,
    }).allowed;
  return {
    composerAccess,
    claim,
    changeStatus: canChangeStatus,
    split: canChangeStatus,
    forward,
    requestRemote: staffCanWrite,
    addInternalNote: staffCanWrite,
    waitForUser: canChangeStatus,
    manageParticipants: staffCanWrite,
    trackTime: staffCanWrite,
    uploadAttachments,
    viewActivity: isStaff,
  };
}
