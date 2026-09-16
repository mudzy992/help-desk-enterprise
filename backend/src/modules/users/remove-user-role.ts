import type { PrismaService } from '../../common/prisma/prisma.service';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { RemoveUserRoleInput } from './users.types';
import { UsersError } from './users.error';

export async function removeUserRole(
  prisma: PrismaService,
  input: RemoveUserRoleInput,
): Promise<void> {
  const userId = input.userId.trim();
  const userRoleId = input.userRoleId.trim();
  const existing = await prisma.userRole.findFirst({
    where: { id: userRoleId, userId },
    select: {
      id: true,
      role: { select: { key: true } },
      organizationalUnitId: true,
      serviceId: true,
    },
  });
  if (existing === null) {
    throw new UsersError('USER_ROLE_NOT_FOUND');
  }
  await prisma.$transaction(async (transaction) => {
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
}
