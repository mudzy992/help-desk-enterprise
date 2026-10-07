import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { assertCanAssignRole } from './assert-can-assign-role';
import { mapUserRoleResponse } from './map-user-role-response';
import type {
  AssignUserRoleInput,
  PrincipalInvalidationHook,
  UserRoleResponse,
} from './users.types';
import { UsersError } from './users.error';
import { lockActiveSuperAdminInvariant } from './super-admin-invariant';

export async function assignUserRole(
  prisma: PrismaService,
  input: AssignUserRoleInput,
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
): Promise<UserRoleResponse> {
  const userId = input.userId.trim();
  const roleKey = input.roleKey.trim();
  const organizationalUnitId = input.organizationalUnitId?.trim() ?? null;
  const serviceId = input.serviceId?.trim() ?? null;
  const isSuperAdminRole = roleKey === authorizationRoleKeys.superAdmin;
  assertCanAssignRole({
    roleKey,
    actorIsSuperAdmin: input.actorIsSuperAdmin,
  });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, isLocalOnly: true, entraObjectId: true, directoryObjectGuid: true },
  });
  if (user === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  const role = await prisma.role.findUnique({
    where: { key: roleKey },
    select: { id: true, key: true, name: true },
  });
  if (role === null) {
    throw new UsersError('ROLE_NOT_FOUND');
  }
  if (isSuperAdminRole && !isEligibleSuperAdminIdentity(user)) {
    throw new UsersError('SUPER_ADMIN_LOCAL_IDENTITY_REQUIRED');
  }
  if (organizationalUnitId !== null) {
    const unit = await prisma.organizationalUnit.findUnique({
      where: { id: organizationalUnitId },
      select: { id: true },
    });
    if (unit === null) {
      throw new UsersError('ORGANIZATIONAL_UNIT_NOT_FOUND');
    }
  }
  if (serviceId !== null) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true },
    });
    if (service === null) {
      throw new UsersError('SERVICE_NOT_FOUND');
    }
  }
  const where = {
    userId,
    roleId: role.id,
    organizationalUnitId,
    serviceId,
  };
  const existing = await prisma.userRole.findFirst({
    where,
    include: {
      role: { select: { key: true, name: true } },
      organizationalUnit: { select: { id: true, ouPath: true } },
      service: { select: { id: true, name: true } },
    },
  });
  if (existing !== null) {
    return mapUserRoleResponse(existing);
  }

  let createdNewRole = false;
  const response = await prisma.$transaction(async (transaction) => {
    if (isSuperAdminRole) {
      // Shares the serializing lock with last-admin removal and directory linking.
      await lockActiveSuperAdminInvariant(transaction as unknown as Prisma.TransactionClient);
      const currentUser = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          isActive: true,
          isLocalOnly: true,
          entraObjectId: true,
          directoryObjectGuid: true,
        },
      });
      if (currentUser === null) {
        throw new UsersError('USER_NOT_FOUND');
      }
      if (!isEligibleSuperAdminIdentity(currentUser)) {
        throw new UsersError('SUPER_ADMIN_LOCAL_IDENTITY_REQUIRED');
      }
      const existingInTransaction = await transaction.userRole.findFirst({
        where,
        include: {
          role: { select: { key: true, name: true } },
          organizationalUnit: { select: { id: true, ouPath: true } },
          service: { select: { id: true, name: true } },
        },
      });
      if (existingInTransaction !== null) {
        return mapUserRoleResponse(existingInTransaction);
      }
    }
    const created = await transaction.userRole.create({
      data: {
        userId,
        roleId: role.id,
        organizationalUnitId,
        serviceId,
      },
      include: {
        role: { select: { key: true, name: true } },
        organizationalUnit: { select: { id: true, ouPath: true } },
        service: { select: { id: true, name: true } },
      },
    });
    await appendAuditLog(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.userRoleAssign,
      entityType: auditLogEntityTypes.userRole,
      entityId: created.id,
      metadata: {
        userId,
        roleKey: role.key,
        organizationalUnitId,
        serviceId,
      },
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
    createdNewRole = true;
    return mapUserRoleResponse(created);
  });
  if (createdNewRole) {
    // A new role changes what this user may do: drop the cached principal context.
    await invalidatePrincipal(userId);
  }
  return response;
}

function isEligibleSuperAdminIdentity(user: {
  readonly isActive: boolean;
  readonly isLocalOnly: boolean;
  readonly entraObjectId: string | null;
  readonly directoryObjectGuid: string | null;
}): boolean {
  return (
    user.isActive &&
    user.isLocalOnly &&
    user.entraObjectId === null &&
    user.directoryObjectGuid === null
  );
}
