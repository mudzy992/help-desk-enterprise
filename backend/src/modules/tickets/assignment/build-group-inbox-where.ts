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
    // Package 5.2.3 (M8 B6): merged child tickets inherit their parent's
    // status, so a PENDING parent that was later merged into another ticket
    // would otherwise leave its children dangling in the work queue. The
    // group inbox is a work queue for live items; merged duplicates are not
    // actionable and are always hidden, matching the staff `hideMerged`
    // default on the all/teams lists.
    { mergedIntoTicketId: null },
    {
      assignedGroupId: context.isSuperAdmin
        ? { not: null }
        : { in: [...actorGroupIds] },
    },
    ...buildTicketVisibilityWhere({ ...input, requesterSeesOwn: false }),
  ];
}
