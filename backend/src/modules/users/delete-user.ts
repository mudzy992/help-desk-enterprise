import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  collectRatedArticleIdsOfUser,
  reconcileKnowledgeArticleRatings,
  type KnowledgeFeedbackClient,
} from '../knowledge-base/knowledge-feedback-rating';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { UserAuditContext, PrincipalInvalidationHook } from './users.types';
import { recordUserChange } from './record-user-change';
import { UsersError } from './users.error';
import {
  assertAnotherActiveSuperAdminExists,
  hasActiveSuperAdminRole,
  lockActiveSuperAdminInvariant,
} from './super-admin-invariant';

const closedTicketStatuses = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;

export async function deleteUser(
  prisma: PrismaService,
  userId: string,
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
  context: UserAuditContext = { actorUserId: null, requestId: null },
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await lockActiveSuperAdminInvariant(transaction);
    const existing = await transaction.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        isActive: true,
        isLocalOnly: true,
        organizationalUnitId: true,
        _count: {
          select: {
            assignedTickets: { where: { status: { notIn: [...closedTicketStatuses] } } },
            requestedTickets: { where: { status: { notIn: [...closedTicketStatuses] } } },
          },
        },
      },
    });
    if (existing === null) {
      throw new UsersError('USER_NOT_FOUND');
    }
    if (existing._count.assignedTickets > 0 || existing._count.requestedTickets > 0) {
      throw new UsersError('HAS_OPEN_TICKETS');
    }
    if (
      existing.isActive &&
      (await hasActiveSuperAdminRole(transaction, existing.id))
    ) {
      await assertAnotherActiveSuperAdminExists(transaction, existing.id);
    }
    await recordUserChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.userDeleted,
      entityId: existing.id,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: existing.organizationalUnitId,
      metadata: {
        before: {
          displayName: existing.displayName,
          email: existing.email,
          isActive: existing.isActive,
          isLocalOnly: existing.isLocalOnly,
          organizationalUnitId: existing.organizationalUnitId,
        },
      },
    });
    // W7.81 (`BA-knowledge-base-07`): `KnowledgeFeedback.userId` is `onDelete: Cascade`, so the votes of this
    // account leave with it and the articles they rated would keep the removed ratings in `ratingCount` and
    // `ratingSum`. Collect the affected articles first, delete, then recompute their totals in the same
    // transaction — the removal and the repair commit together or not at all.
    const ratedArticleIds = await collectRatedArticleIdsOfUser(
      transaction as unknown as KnowledgeFeedbackClient,
      userId,
    );
    await transaction.user.delete({ where: { id: userId } });
    await reconcileKnowledgeArticleRatings(
      transaction as unknown as KnowledgeFeedbackClient,
      ratedArticleIds,
    );
  });
  // The row is gone, so the version cannot be bumped; dropping the principal
  // cache pointer still makes any old session stop resolving to this account.
  await invalidatePrincipal(userId);
}
