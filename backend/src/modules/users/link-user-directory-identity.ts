import { authenticationConstants } from '../authentication/authentication.constants';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { lockActiveSuperAdminInvariant } from './super-admin-invariant';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { DirectorySyncService } from '../directory-sync/directory-sync.service';
import { ldapsExternalIdPrefix } from '../directory-sync/ldaps/ldaps-directory.types';
import { listUsersSummary } from './list-users-summary';
import { recordUserChange } from './record-user-change';
import type { UserAuditContext, UserSummaryResponse } from './users.types';
import { UsersError } from './users.error';

export async function linkUserDirectoryIdentity(input: {
  readonly prisma: PrismaService;
  readonly directorySyncService: DirectorySyncService;
  readonly userId: string;
  readonly directoryExternalId: string;
  readonly context?: UserAuditContext;
}): Promise<UserSummaryResponse> {
  const userId = input.userId.trim();
  const directoryExternalId = input.directoryExternalId.trim();
  const context = input.context ?? { actorUserId: null, requestId: null };
  if (userId.length === 0 || directoryExternalId.length === 0) {
    throw new UsersError('INVALID_INPUT');
  }
  const existing = await input.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isLocalOnly: true,
      entraObjectId: true,
      directoryObjectGuid: true,
      organizationalUnitId: true,
      userRoles: { select: { role: { select: { key: true } } } },
    },
  });
  if (existing === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  if (
    !existing.isLocalOnly ||
    existing.entraObjectId !== null ||
    existing.directoryObjectGuid !== null
  ) {
    throw new UsersError('USER_ALREADY_DIRECTORY_LINKED');
  }
  const roleKeys = existing.userRoles.map((assignment) => assignment.role.key);
  if (roleKeys.includes(authenticationConstants.superAdminRoleKey)) {
    throw new UsersError('SUPER_ADMIN_DIRECTORY_LINK_FORBIDDEN');
  }
  const directoryUsers = await input.directorySyncService.listDirectoryUsersForLinking();
  const directoryIdentity = directoryUsers.find((user) => user.externalId === directoryExternalId);
  if (directoryIdentity === undefined) {
    throw new UsersError('DIRECTORY_IDENTITY_NOT_FOUND');
  }
  // LDAPS identities carry the on-premises objectGUID rather than the Entra oid.
  const directoryObjectGuid = directoryExternalId.startsWith(ldapsExternalIdPrefix)
    ? directoryExternalId.slice(ldapsExternalIdPrefix.length)
    : null;
  const conflict = await input.prisma.user.findUnique({
    where: directoryObjectGuid === null ? { entraObjectId: directoryExternalId } : { directoryObjectGuid },
    select: { id: true },
  });
  if (conflict !== null && conflict.id !== existing.id) {
    throw new UsersError('DIRECTORY_IDENTITY_CONFLICT');
  }
  await input.prisma.$transaction(async (transaction) => {
    // Shares the lock with SUPER_ADMIN assignment so a stale pre-check cannot
    // race a role grant and convert a SuperAdmin into a directory identity.
    await lockActiveSuperAdminInvariant(transaction as unknown as Prisma.TransactionClient);
    const current = await transaction.user.findUnique({
      where: { id: existing.id },
      select: {
        id: true,
        isLocalOnly: true,
        entraObjectId: true,
        directoryObjectGuid: true,
        organizationalUnitId: true,
        userRoles: { select: { role: { select: { key: true } } } },
      },
    });
    if (current === null) {
      throw new UsersError('USER_NOT_FOUND');
    }
    if (
      !current.isLocalOnly ||
      current.entraObjectId !== null ||
      current.directoryObjectGuid !== null
    ) {
      throw new UsersError('USER_ALREADY_DIRECTORY_LINKED');
    }
    if (
      current.userRoles.some(
        (assignment) => assignment.role.key === authenticationConstants.superAdminRoleKey,
      )
    ) {
      throw new UsersError('SUPER_ADMIN_DIRECTORY_LINK_FORBIDDEN');
    }
    const conflictInTransaction = await transaction.user.findUnique({
      where:
        directoryObjectGuid === null
          ? { entraObjectId: directoryExternalId }
          : { directoryObjectGuid },
      select: { id: true },
    });
    if (conflictInTransaction !== null && conflictInTransaction.id !== current.id) {
      throw new UsersError('DIRECTORY_IDENTITY_CONFLICT');
    }
    await transaction.user.update({
      where: { id: current.id },
      data: {
        ...(directoryObjectGuid === null
          ? { entraObjectId: directoryExternalId }
          : { directoryObjectGuid, distinguishedName: directoryIdentity.distinguishedName }),
        isLocalOnly: false,
        localPasswordHash: null,
        mustChangePassword: false,
      },
    });
    await recordUserChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.userUpdated,
      entityId: current.id,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      organizationalUnitId: current.organizationalUnitId,
      metadata: {
        directoryIdentityLinked: true,
        directoryKind: directoryObjectGuid === null ? 'entra' : 'ldaps',
        before: { isLocalOnly: true, directoryLinked: false },
        after: { isLocalOnly: false, directoryLinked: true },
      },
    });
  });
  const summaries = await listUsersSummary(input.prisma, { ids: [existing.id] });
  const summary = summaries.find((user) => user.id === existing.id);
  if (summary === undefined) {
    throw new UsersError('USER_NOT_FOUND');
  }
  return summary;
}
