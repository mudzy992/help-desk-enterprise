import type { Prisma } from '../../generated/prisma/client';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { mapUserRoleResponse } from './map-user-role-response';
import { lockActiveSuperAdminInvariant } from './super-admin-invariant';
import type { UserRoleResponse } from './users.types';
import { UsersError } from './users.error';

/**
 * W2.26 (`BA-users-02`): the role grant used to live in its own transaction, after
 * the user and the password had already been committed. `createUser` now composes
 * user, credential, role and audit in **one** commit, so the write itself has to be
 * callable on the caller's transaction.
 *
 * Everything that can refuse the grant is therefore evaluated on that transaction:
 * the server-side `user.manage` scope check already ran in the guard, the actor's
 * right to hand out `SUPER_ADMIN` ran in the pre-flight, and the identity invariant
 * (an active local-only account without a directory binding) is re-read here, under
 * the same serializing lock the last-admin guard uses.
 */
export const userRoleInclude = {
  role: { select: { key: true, name: true } },
  organizationalUnit: { select: { id: true, ouPath: true } },
  service: { select: { id: true, name: true } },
} as const;

export type CreateUserRoleWithinTransactionInput = {
  readonly userId: string;
  readonly role: { readonly id: string; readonly key: string };
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly actorUserId: string | null;
  readonly requestId: string | null;
};

export type CreateUserRoleWithinTransactionResult = {
  readonly response: UserRoleResponse;
  /** `false` when the identical assignment already existed (idempotent re-grant). */
  readonly created: boolean;
};

export async function createUserRoleWithinTransaction(
  transaction: Prisma.TransactionClient,
  input: CreateUserRoleWithinTransactionInput,
): Promise<CreateUserRoleWithinTransactionResult> {
  const where = {
    userId: input.userId,
    roleId: input.role.id,
    organizationalUnitId: input.organizationalUnitId,
    serviceId: input.serviceId,
  };
  if (input.role.key === authorizationRoleKeys.superAdmin) {
    // Shares the serializing lock with last-admin removal and directory linking.
    await lockActiveSuperAdminInvariant(transaction);
    const currentUser = await transaction.user.findUnique({
      where: { id: input.userId },
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
  }
  const existing = await transaction.userRole.findFirst({
    where,
    include: userRoleInclude,
  });
  if (existing !== null) {
    return { response: mapUserRoleResponse(existing), created: false };
  }
  const created = await transaction.userRole.create({
    data: where,
    include: userRoleInclude,
  });
  await appendAuditLog(transaction as unknown as AuditLogWriteClient, {
    action: auditLogActions.userRoleAssign,
    entityType: auditLogEntityTypes.userRole,
    entityId: created.id,
    metadata: {
      userId: input.userId,
      roleKey: input.role.key,
      organizationalUnitId: input.organizationalUnitId,
      serviceId: input.serviceId,
    },
    actorUserId: input.actorUserId,
    requestId: input.requestId,
  });
  return { response: mapUserRoleResponse(created), created: true };
}

export function isEligibleSuperAdminIdentity(user: {
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
