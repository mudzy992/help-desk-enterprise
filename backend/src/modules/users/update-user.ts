import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { JsonValue } from '../change-log/change-log.types';
import type { UserAuditContext, PrincipalInvalidationHook, UpdateUserInput, UserSummaryResponse } from './users.types';
import type { AccountSecurityBoundaryPort, AccountSecurityCut } from '../authentication/security/account-security-boundary.service';
import { recordUserChange } from './record-user-change';
import { UsersError } from './users.error';
import { listUsersSummary } from './list-users-summary';
import {
  assertAnotherActiveSuperAdminExists,
  hasActiveSuperAdminRole,
  lockActiveSuperAdminInvariant,
} from './super-admin-invariant';

type UserUpdateField = 'displayName' | 'email' | 'organizationalUnitId' | 'isActive';
type ExistingUser = {
  readonly id: string;
  readonly email: string;
  readonly isLocalOnly: boolean;
  readonly displayName: string;
  readonly organizationalUnitId: string | null;
  readonly isActive: boolean;
};
type UserUpdateData = {
  displayName?: string;
  email?: string;
  organizationalUnitId?: string | null;
  isActive?: boolean;
};

export async function updateUser(
  prisma: PrismaService,
  input: UpdateUserInput,
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
  context: UserAuditContext = { actorUserId: null, requestId: null },
  /**
   * W2.22 (`BA-users-03`): deactivation moves the authentication boundary, so the
   * session cutoff, the session rows and the local MFA factors are written **in the
   * same transaction**. When the caller wires no port (unit tests that only exercise
   * the profile fields) the deactivation is unchanged; `UsersService` always wires it.
   */
  securityBoundary?: AccountSecurityBoundaryPort,
): Promise<UserSummaryResponse> {
  const existing = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      isLocalOnly: true,
      displayName: true,
      organizationalUnitId: true,
      isActive: true,
    },
  });
  if (existing === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  const data = await buildUpdateData(prisma, existing, input);
  const changedData = Object.fromEntries(
    Object.entries(data).filter(([field, value]) => existing[field as UserUpdateField] !== value),
  ) as UserUpdateData;
  const changedFields = Object.keys(changedData) as UserUpdateField[];
  if (changedFields.length > 0) {
    const before = Object.fromEntries(
      changedFields.map((field) => [field, existing[field]]),
    ) as JsonValue;
    let securityCut: AccountSecurityCut | null = null;
    await prisma.$transaction(async (transaction) => {
      if (changedData.isActive === false && existing.isActive) {
        await lockActiveSuperAdminInvariant(transaction);
        const current = await transaction.user.findUnique({
          where: { id: input.userId },
          select: { isActive: true },
        });
        if (
          current?.isActive === true &&
          (await hasActiveSuperAdminRole(transaction, input.userId))
        ) {
          await assertAnotherActiveSuperAdminExists(transaction, input.userId);
        }
      }
      await transaction.user.update({ where: { id: input.userId }, data: changedData });
      if (changedData.isActive === false && existing.isActive && securityBoundary !== undefined) {
        // Inside the transaction: a failure here rolls the deactivation back, so the
        // API can never answer 2xx while the old tokens are still alive.
        securityCut = await securityBoundary.cutWithinTransaction(transaction, {
          userId: input.userId,
          actorUserId: context.actorUserId,
          transition: 'deactivated',
        });
      }
      await recordUserChange(transaction as unknown as AuditLogWriteClient, {
        action: auditLogActions.userUpdated,
        entityId: input.userId,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        organizationalUnitId:
          changedData.organizationalUnitId !== undefined
            ? changedData.organizationalUnitId
            : existing.organizationalUnitId,
        metadata: { before, after: changedData as JsonValue },
      });
    });
    if (securityCut !== null) {
      await securityBoundary?.afterCommit({
        userId: input.userId,
        actorUserId: context.actorUserId,
        cut: securityCut,
      });
    }
    // Cached authorization includes the user's unit and active state.
    await invalidatePrincipal(input.userId);
  }
  const summaries = await listUsersSummary(prisma, { ids: [input.userId] });
  const summary = summaries.find((user) => user.id === input.userId);
  if (summary === undefined) {
    throw new UsersError('USER_NOT_FOUND');
  }
  return summary;
}

async function buildUpdateData(
  prisma: PrismaService,
  existing: ExistingUser,
  input: UpdateUserInput,
): Promise<UserUpdateData> {
  const data: UserUpdateData = {};
  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim();
    if (displayName.length === 0) {
      throw new UsersError('INVALID_INPUT');
    }
    data.displayName = displayName;
  }
  if (input.email !== undefined) {
    if (!existing.isLocalOnly) {
      throw new UsersError('INVALID_INPUT');
    }
    const email = input.email.trim().toLowerCase();
    if (email.length === 0) {
      throw new UsersError('INVALID_INPUT');
    }
    if (email !== existing.email) {
      const conflict = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (conflict !== null && conflict.id !== existing.id) {
        throw new UsersError('EMAIL_CONFLICT');
      }
      data.email = email;
    }
  }
  if (input.organizationalUnitId !== undefined) {
    const organizationalUnitId =
      input.organizationalUnitId === null || input.organizationalUnitId.trim() === ''
        ? null
        : input.organizationalUnitId.trim();
    if (organizationalUnitId !== null) {
      const unit = await prisma.organizationalUnit.findUnique({
        where: { id: organizationalUnitId },
        select: { id: true },
      });
      if (unit === null) {
        throw new UsersError('ORGANIZATIONAL_UNIT_NOT_FOUND');
      }
    }
    data.organizationalUnitId = organizationalUnitId;
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }
  return data;
}
