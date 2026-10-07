import type { Prisma } from '../../generated/prisma/client';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { UsersError } from './users.error';

/** Separate advisory-lock key for concurrent mutations of the last active SuperAdmin. */
const SUPER_ADMIN_LOCK_NAMESPACE = 1_397_051_457;
const SUPER_ADMIN_LOCK_RESOURCE = 1;

/**
 * Acquires a transaction-scoped PostgreSQL advisory lock. All mutation paths
 * which can remove the final active SuperAdmin take this same lock before
 * checking, so concurrent requests cannot both pass a stale count.
 */
export async function lockActiveSuperAdminInvariant(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${SUPER_ADMIN_LOCK_NAMESPACE}, ${SUPER_ADMIN_LOCK_RESOURCE})`;
}

export async function hasSuperAdminRole(
  transaction: Prisma.TransactionClient,
  userId: string,
  excludingRoleId?: string,
): Promise<boolean> {
  const role = await transaction.userRole.findFirst({
    where: {
      userId,
      ...(excludingRoleId === undefined ? {} : { id: { not: excludingRoleId } }),
      role: { key: authorizationRoleKeys.superAdmin },
    },
    select: { id: true },
  });
  return role !== null;
}

/** A SuperAdmin counts toward availability only while the identity is active and local-only. */
export async function hasActiveSuperAdminRole(
  transaction: Prisma.TransactionClient,
  userId: string,
  excludingRoleId?: string,
): Promise<boolean> {
  const role = await transaction.userRole.findFirst({
    where: {
      userId,
      ...(excludingRoleId === undefined ? {} : { id: { not: excludingRoleId } }),
      role: { key: authorizationRoleKeys.superAdmin },
      user: {
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
      },
    },
    select: { id: true },
  });
  return role !== null;
}

export async function hasOtherActiveSuperAdmin(
  transaction: Prisma.TransactionClient,
  excludingUserId: string,
): Promise<boolean> {
  const role = await transaction.userRole.findFirst({
    where: {
      userId: { not: excludingUserId },
      role: { key: authorizationRoleKeys.superAdmin },
      user: {
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
      },
    },
    select: { id: true },
  });
  return role !== null;
}

/** True if deleting this OU would remove the final active local SuperAdmin assignment. */
export async function isLastActiveSuperAdminOrganizationalUnitAssignment(
  transaction: Prisma.TransactionClient,
  organizationalUnitId: string,
): Promise<boolean> {
  const inUnit = await transaction.userRole.findFirst({
    where: {
      organizationalUnitId,
      role: { key: authorizationRoleKeys.superAdmin },
      user: {
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
      },
    },
    select: { id: true },
  });
  if (inUnit === null) {
    return false;
  }
  const outsideUnit = await transaction.userRole.findFirst({
    where: {
      OR: [
        { organizationalUnitId: null },
        { organizationalUnitId: { not: organizationalUnitId } },
      ],
      role: { key: authorizationRoleKeys.superAdmin },
      user: {
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
      },
    },
    select: { id: true },
  });
  return outsideUnit === null;
}

export async function assertAnotherActiveSuperAdminExists(
  transaction: Prisma.TransactionClient,
  excludingUserId: string,
): Promise<void> {
  if (!(await hasOtherActiveSuperAdmin(transaction, excludingUserId))) {
    throw new UsersError('LAST_SUPER_ADMIN_REQUIRED');
  }
}
