import type { PrismaService } from '../../common/prisma/prisma.service';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { assertCanAssignRole } from './assert-can-assign-role';
import { mapUserRoleResponse } from './map-user-role-response';
import type { AssignUserRoleInput, UserRoleResponse } from './users.types';
import { UsersError } from './users.error';

export async function assignUserRole(
  prisma: PrismaService,
  input: AssignUserRoleInput,
): Promise<UserRoleResponse> {
  const userId = input.userId.trim();
  const roleKey = input.roleKey.trim();
  const organizationalUnitId = input.organizationalUnitId?.trim() ?? null;
  const serviceId = input.serviceId?.trim() ?? null;
  assertCanAssignRole({
    roleKey,
    actorIsSuperAdmin: input.actorIsSuperAdmin,
  });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
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
  const existing = await prisma.userRole.findFirst({
    where: {
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
  if (existing !== null) {
    return mapUserRoleResponse(existing);
  }
  return prisma.$transaction(async (transaction) => {
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
    return mapUserRoleResponse(created);
  });
}
