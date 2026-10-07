import type { PrismaService } from '../../common/prisma/prisma.service';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type {
  PrincipalInvalidationHook,
  RemoveUserRoleInput,
} from './users.types';
import { UsersError } from './users.error';
import {
  assertAnotherActiveSuperAdminExists,
  hasActiveSuperAdminRole,
  lockActiveSuperAdminInvariant,
} from './super-admin-invariant';
import { authorizationRoleKeys } from '../authorization/authorization.constants';

export async function removeUserRole(
  prisma: PrismaService,
  input: RemoveUserRoleInput,
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
): Promise<void> {
  const userId = input.userId.trim();
  const userRoleId = input.userRoleId.trim();
  await prisma.$transaction(async (transaction) => {
    // Serializes this removal with deactivation and deletion before the count.
    await lockActiveSuperAdminInvariant(transaction);
    const existing = await transaction.userRole.findFirst({
      where: { id: userRoleId, userId },
      select: {
        id: true,
        role: { select: { key: true } },
        organizationalUnitId: true,
        serviceId: true,
        user: {
          select: {
            isActive: true,
            isLocalOnly: true,
            entraObjectId: true,
            directoryObjectGuid: true,
          },
        },
      },
    });
    if (existing === null) {
      throw new UsersError('USER_ROLE_NOT_FOUND');
    }
    if (
      existing.role.key === authorizationRoleKeys.superAdmin &&
      existing.user.isActive &&
      existing.user.isLocalOnly &&
      existing.user.entraObjectId === null &&
      existing.user.directoryObjectGuid === null &&
      !(await hasActiveSuperAdminRole(transaction, userId, existing.id))
    ) {
      await assertAnotherActiveSuperAdminExists(transaction, userId);
    }
    await transaction.userRole.delete({ where: { id: existing.id } });
    await appendAuditLog(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.userRoleRemove,
      entityType: auditLogEntityTypes.userRole,
      entityId: existing.id,
      metadata: {
        userId,
        roleKey: existing.role.key,
        organizationalUnitId: existing.organizationalUnitId,
        serviceId: existing.serviceId,
      },
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
  });
  // The role is gone; so is the cached decision that granted it.
  await invalidatePrincipal(userId);
}
