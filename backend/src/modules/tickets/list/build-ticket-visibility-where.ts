import type { Prisma } from '../../../generated/prisma/client';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import type { TicketConfidentialConfiguration } from '../confidential/confidential.types';
import {
  buildManageScopeWhere,
  type OrganizationalUnitScopeRow,
} from './build-manage-scope-where';

export type TicketVisibilityInput = {
  readonly context: AuthorizationContext;
  readonly units: readonly OrganizationalUnitScopeRow[];
  readonly actorGroupIds: readonly string[];
  readonly configuration: TicketConfidentialConfiguration;
  readonly now: Date;
  /**
   * The list also shows a requester their own tickets. The group inbox is a
   * work queue and does not: it needs the OU/service scope (default true).
   */
  readonly requesterSeesOwn?: boolean;
};

/**
 * Who may see a ticket in a list, as AND-ed `where` clauses instead of a
 * per-ticket check. Same rules as the single-ticket path:
 *
 *  1. baseline: SuperAdmin, the requester, or an agent/admin whose OU and
 *     service scope covers the ticket;
 *  2. confidential tickets additionally need a confidential grant (requester,
 *     assignee, handler group, participant, explicit grant, allowed viewer
 *     role/group within scope, or an active break-glass). SuperAdmin has no
 *     implicit access to confidential tickets.
 *
 * Break-glass is included on purpose: it is a visibility source in the
 * confidential matrix, so a list must show what the ticket page allows.
 */
export function buildTicketVisibilityWhere(
  input: TicketVisibilityInput,
): Prisma.TicketWhereInput[] {
  const manageScope = buildManageScopeWhere(input.context, input.units);
  const clauses: Prisma.TicketWhereInput[] = [];
  if (!input.context.isSuperAdmin) {
    clauses.push(
      input.requesterSeesOwn === false
        ? manageScope
        : { OR: [{ requesterId: input.context.subjectId }, manageScope] },
    );
  }
  const confidential = buildConfidentialWhere(input, manageScope);
  if (confidential !== null) {
    clauses.push(confidential);
  }
  return clauses;
}

function buildConfidentialWhere(
  input: TicketVisibilityInput,
  manageScope: Prisma.TicketWhereInput,
): Prisma.TicketWhereInput | null {
  const { context, configuration, actorGroupIds } = input;
  if (!configuration.enabled) {
    return null;
  }
  const me = context.subjectId;
  const alternatives: Prisma.TicketWhereInput[] = [
    { isConfidential: false },
    { requesterId: me },
    { assignedUserId: me },
    { participants: { some: { userId: me } } },
    { confidentialGrants: { some: { userId: me } } },
    {
      breakGlassEvents: {
        some: {
          actorUserId: me,
          OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
        },
      },
    },
  ];
  if (actorGroupIds.length > 0) {
    alternatives.push(
      { assignedGroupId: { in: [...actorGroupIds] } },
      { confidentialGrants: { some: { groupId: { in: [...actorGroupIds] } } } },
    );
  }
  const viaViewerRole = context.assignments.some((assignment) =>
    configuration.allowedViewerRoles.includes(assignment.roleKey),
  );
  const viaViewerGroup = actorGroupIds.some((groupId) =>
    configuration.allowedViewerGroupIds.includes(groupId),
  );
  if (viaViewerRole || viaViewerGroup) {
    alternatives.push(manageScope);
  }
  return { OR: alternatives };
}
