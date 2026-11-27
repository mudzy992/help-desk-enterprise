import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { RoleHolderFence } from '../../common/principal-context/principal-context.types';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { RbacError } from './rbac.error';
import { assertKnownPermissionKeys } from './assert-known-permission-keys';
import { ensurePermissionRows } from './ensure-permission-rows';
import { getRolePermissions } from './get-role-permissions';
import { loadRoleByKey } from './load-role-by-key';
import type { ReplaceRolePermissionsInput } from './rbac.types';
import {
  permissionKeySetsMatch,
  verifyRolePermissionPreviewToken,
} from './role-permission-preview-token';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { lockActiveSuperAdminInvariant } from '../users/super-admin-invariant';

/**
 * Phase 2.2: a role's permission set is part of every holder's cached principal
 * context, so the caller passes a hook that publishes the change once the
 * transaction has committed (`PrincipalContextInvalidator.publishCommittedRoleHolders`).
 *
 * W2.32 (`BA-rbac-05`): the hook no longer has to bump anything. The versions the
 * write committed are handed over (`fencedHolders`), and they are the reason the
 * change is durable — a hook that never runs, throws or finds Redis unreachable
 * leaves no stale grant behind.
 */
export type RoleHoldersInvalidationHook = (
  roleId: string,
  fencedHolders: readonly RoleHolderFence[],
) => Promise<unknown>;

/**
 * W2.32 (`BA-rbac-05`): the durable half of the invalidation. Called **inside**
 * the write's transaction, so the intent to drop the holders' cached contexts
 * commits or rolls back together with the permission matrix. The payload only
 * carries the role and the highest committed version; the holders are re-read
 * when the message is delivered, which keeps it bounded and self-healing.
 */
export type RoleHoldersInvalidationScheduler = (
  transaction: Prisma.TransactionClient,
  scheduled: {
    readonly roleId: string;
    readonly roleKey: string;
    readonly revision: number;
  },
) => Promise<unknown>;

export async function replaceRolePermissions(
  prisma: PrismaService,
  input: ReplaceRolePermissionsInput,
  invalidateRoleHolders: RoleHoldersInvalidationHook = async () => 0,
  // Paket 5.1 (M4 B2): the secret that signed the preview; the write is refused
  // without a matching, unexpired preview (RAW `:231–232`).
  previewSigningSecret = '',
  scheduleInvalidation?: RoleHoldersInvalidationScheduler,
): Promise<readonly string[]> {
  const preview = verifyRolePermissionPreviewToken(
    input.previewToken,
    {
      roleKey: input.roleKey,
      permissionKeys: input.permissionKeys,
      actorUserId: input.actorUserId,
    },
    previewSigningSecret,
  );
  const reason = input.reason.trim();
  if (reason.length === 0 || reason.length > 500) {
    throw new RbacError('PREVIEW_REQUIRED');
  }
  const role = await loadRoleByKey(prisma, input.roleKey);
  const nextPermissionKeys = assertKnownPermissionKeys(input.permissionKeys);
  const committed = await prisma.$transaction(async (transaction) => {
    // The same transaction lock protects admin availability and the permission
    // matrix. Every permission write is serialized before its invariant check.
    await lockActiveSuperAdminInvariant(transaction);
    if (role.key === authorizationRoleKeys.superAdmin) {
      // Runtime SuperAdmin authority is intentionally the full catalog. Letting
      // this row be edited creates a deceptive matrix with no runtime effect.
      throw new RbacError('SYSTEM_ROLE_PERMISSIONS_IMMUTABLE');
    }
    // BA-rbac-01 (W2.29): optimistic compare-and-swap. The previewed baseline is
    // read **inside** this transaction, after the advisory lock, so the value the
    // audit calls `previousPermissionKeys` is the value the write replaced. A
    // preview that is older than someone else's commit is refused here — before
    // any row changes and before the audit row exists.
    const previousPermissionKeys = await getRolePermissions(
      transaction as PrismaService,
      role.key,
    );
    if (
      !permissionKeySetsMatch(
        preview.baselinePermissionKeys,
        previousPermissionKeys,
      )
    ) {
      throw new RbacError('PREVIEW_STALE');
    }
    // W2.30 (BA-rbac-02): the preview token is single-use. The claim is an
    // atomic UPDATE on `consumedAt IS NULL` that shares this transaction, so an
    // HTTP retry, a double-click or two parallel PUTs of the same token produce
    // exactly one write; a rollback (stale baseline, invariant fault) releases it.
    const claim = await transaction.rolePermissionPreviewClaim.updateMany({
      where: {
        jti: preview.jti,
        roleKey: role.key,
        actorUserId: preview.actorUserId,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    if (claim.count !== 1) {
      const row = await transaction.rolePermissionPreviewClaim.findUnique({
        where: { jti: preview.jti },
        select: { consumedAt: true },
      });
      if (row === null) {
        // A token minted by a build that did not record previews (rolling deploy)
        // is not silently replayable.
        throw new RbacError('PREVIEW_REQUIRED');
      }
      throw new RbacError(
        row.consumedAt === null ? 'PREVIEW_STALE' : 'PREVIEW_CONSUMED',
      );
    }
    const idsByKey = await ensurePermissionRows(
      transaction as PrismaService,
      nextPermissionKeys,
    );
    await transaction.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permissionKey of nextPermissionKeys) {
      const permissionId = idsByKey.get(permissionKey);
      if (permissionId === undefined) {
        continue;
      }
      await transaction.rolePermission.create({
        data: { roleId: role.id, permissionId },
      });
    }
    await appendAuditLog(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.rolePermissionReplace,
      entityType: auditLogEntityTypes.role,
      entityId: role.key,
      metadata: {
        roleKey: role.key,
        previousPermissionKeys,
        nextPermissionKeys,
        // Paket 5.1 (M4 B2): RAW `:223` — change log nosi i zašto.
        reason,
        previewedAt: new Date(preview.issuedAt * 1000).toISOString(),
      },
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
    // W2.32 (`BA-rbac-05`): the fence belongs to the write, not to the notice
    // about it. Every holder's `authzVersion` moves in this transaction, so the
    // payload cached under the old version can never be served again — the
    // loader compares the payload version with this column on every hit. Redis,
    // the post-commit hook and the outbox below are all allowed to fail; none of
    // them is what makes the removed permission stop counting.
    const fencedHolders = await fenceRoleHolders(transaction, role.id);
    if (fencedHolders.length > 0 && scheduleInvalidation !== undefined) {
      await scheduleInvalidation(transaction, {
        roleId: role.id,
        roleKey: role.key,
        revision: Math.max(...fencedHolders.map((holder) => holder.authzVersion)),
      });
    }
    return { nextPermissionKeys, fencedHolders };
  });
  if (committed.fencedHolders.length > 0) {
    await invalidateRoleHolders(role.id, committed.fencedHolders);
  }
  return committed.nextPermissionKeys;
}

/**
 * Bumps `authzVersion` for every distinct holder of the role and reads the new
 * values back from the same transaction, so the caller can hand the exact
 * numbers to the cache pointer.
 */
async function fenceRoleHolders(
  transaction: Prisma.TransactionClient,
  roleId: string,
): Promise<readonly RoleHolderFence[]> {
  const holders = await transaction.userRole.findMany({
    where: { roleId },
    select: { userId: true },
    distinct: ['userId'],
    orderBy: { userId: 'asc' },
  });
  const userIds = holders.map((holder) => holder.userId);
  if (userIds.length === 0) {
    return [];
  }
  await transaction.user.updateMany({
    where: { id: { in: userIds } },
    data: { authzVersion: { increment: 1 } },
  });
  const users = await transaction.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, authzVersion: true },
  });
  return users.map((user) => ({
    userId: user.id,
    authzVersion: user.authzVersion,
  }));
}
