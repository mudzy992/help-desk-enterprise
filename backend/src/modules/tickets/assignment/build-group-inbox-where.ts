import type { Prisma } from '../../../generated/prisma/client';
import {
  buildTicketVisibilityWhere,
  type TicketVisibilityInput,
} from '../list/build-ticket-visibility-where';

/**
 * `where` clauses for the group inbox: unassigned, still `PENDING`, handled by
 * a group the caller belongs to (SuperAdmin: any group), and visible to the
 * caller by scope and confidentiality. `null` means the inbox is empty because
 * the caller is in no group.
 */
export function buildGroupInboxWhere(
  input: TicketVisibilityInput,
): Prisma.TicketWhereInput[] | null {
  const { context, actorGroupIds } = input;
  if (!context.isSuperAdmin && actorGroupIds.length === 0) {
    return null;
  }
  return [
    { assignedUserId: null },
    { status: 'PENDING' },
    {
      assignedGroupId: context.isSuperAdmin
        ? { not: null }
        : { in: [...actorGroupIds] },
    },
    ...buildTicketVisibilityWhere({ ...input, requesterSeesOwn: false }),
  ];
}
