import type { PrismaService } from '../../common/prisma/prisma.service';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { assignUserRole } from './assign-user-role';
import { listUsersSummary } from './list-users-summary';
import type { CreateUserInput, UserSummaryResponse } from './users.types';
import { UsersError } from './users.error';

export async function createUser(
  prisma: PrismaService,
  input: CreateUserInput,
): Promise<UserSummaryResponse> {
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const organizationalUnitId = input.organizationalUnitId?.trim() || null;
  if (displayName.length === 0 || email.length === 0) {
    throw new UsersError('INVALID_INPUT');
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
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing !== null) {
    throw new UsersError('EMAIL_CONFLICT');
  }
  const isSuperAdminRole =
    input.roleKey.trim() === authorizationRoleKeys.superAdmin;
  const created = await prisma.user.create({
    data: {
      displayName,
      email,
      organizationalUnitId,
      isLocalOnly: isSuperAdminRole,
      isActive: true,
    },
  });
  await assignUserRole(prisma, {
    userId: created.id,
    roleKey: input.roleKey,
    organizationalUnitId,
    serviceId: null,
    actorUserId: input.actorUserId,
    actorIsSuperAdmin: input.actorIsSuperAdmin,
    requestId: input.requestId,
  });
  const summaries = await listUsersSummary(prisma);
  const summary = summaries.find((user) => user.id === created.id);
  if (summary === undefined) {
    throw new UsersError('USER_NOT_FOUND');
  }
  return summary;
}
