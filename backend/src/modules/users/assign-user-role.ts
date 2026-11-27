import type { PrismaService } from '../../common/prisma/prisma.service';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { assertCanAssignRole } from './assert-can-assign-role';
import { mapUserRoleResponse } from './map-user-role-response';
import type {
  AssignUserRoleInput,
  PrincipalInvalidationHook,
  UserRoleResponse,
} from './users.types';
import { UsersError } from './users.error';
import {
  createUserRoleWithinTransaction,
  isEligibleSuperAdminIdentity,
  userRoleInclude,
} from './user-role-assignment.transaction';

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
  const existing = await prisma.userRole.findFirst({
    where: {
      userId,
      roleId: role.id,
      organizationalUnitId,
      serviceId,
    },
    include: userRoleInclude,
  });
  if (existing !== null) {
    return mapUserRoleResponse(existing);
  }

  /*
    W2.26 (`BA-users-02`): the grant itself is one composable transaction step, so
    `createUser` can commit the user, the credential and this grant together. The
    public path keeps its own transaction (and the post-commit invalidation) unchanged.
  */
  const { response, created } = await prisma.$transaction((transaction) =>
    createUserRoleWithinTransaction(transaction, {
      userId,
      role,
      organizationalUnitId,
      serviceId,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    }),
  );
  if (created) {
    // A new role changes what this user may do: drop the cached principal context.
    await invalidatePrincipal(userId);
  }
  return response;
}
