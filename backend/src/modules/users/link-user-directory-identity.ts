import { authenticationConstants } from '../authentication/authentication.constants';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { DirectorySyncService } from '../directory-sync/directory-sync.service';
import { listUsersSummary } from './list-users-summary';
import type { UserSummaryResponse } from './users.types';
import { UsersError } from './users.error';

export async function linkUserDirectoryIdentity(input: {
  readonly prisma: PrismaService;
  readonly directorySyncService: DirectorySyncService;
  readonly userId: string;
  readonly directoryExternalId: string;
}): Promise<UserSummaryResponse> {
  const userId = input.userId.trim();
  const directoryExternalId = input.directoryExternalId.trim();
  if (userId.length === 0 || directoryExternalId.length === 0) {
    throw new UsersError('INVALID_INPUT');
  }
  const existing = await input.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isLocalOnly: true,
      entraObjectId: true,
      userRoles: { select: { role: { select: { key: true } } } },
    },
  });
  if (existing === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  if (!existing.isLocalOnly) {
    throw new UsersError('USER_ALREADY_DIRECTORY_LINKED');
  }
  if (existing.entraObjectId !== null) {
    throw new UsersError('USER_ALREADY_DIRECTORY_LINKED');
  }
  const roleKeys = existing.userRoles.map((assignment) => assignment.role.key);
  if (roleKeys.includes(authenticationConstants.superAdminRoleKey)) {
    throw new UsersError('SUPER_ADMIN_DIRECTORY_LINK_FORBIDDEN');
  }
  const directoryUsers =
    await input.directorySyncService.listDirectoryUsersForLinking();
  const directoryIdentity = directoryUsers.find(
    (user) => user.externalId === directoryExternalId,
  );
  if (directoryIdentity === undefined) {
    throw new UsersError('DIRECTORY_IDENTITY_NOT_FOUND');
  }
  const conflict = await input.prisma.user.findUnique({
    where: { entraObjectId: directoryExternalId },
    select: { id: true },
  });
  if (conflict !== null && conflict.id !== existing.id) {
    throw new UsersError('DIRECTORY_IDENTITY_CONFLICT');
  }
  await input.prisma.user.update({
    where: { id: existing.id },
    data: {
      entraObjectId: directoryExternalId,
      isLocalOnly: false,
      localPasswordHash: null,
      mustChangePassword: false,
    },
  });
  const summaries = await listUsersSummary(input.prisma);
  const summary = summaries.find((user) => user.id === existing.id);
  if (summary === undefined) {
    throw new UsersError('USER_NOT_FOUND');
  }
  return summary;
}
