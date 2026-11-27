import type { PrismaService } from '../../common/prisma/prisma.service';
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
 * context, so the caller passes a hook that invalidates all of them once the
 * transaction has committed (`PrincipalContextInvalidator.invalidateRoleHolders`).
 */
export type RoleHoldersInvalidationHook = (
  roleId: string,
) => Promise<unknown>;

export async function replaceRolePermissions(
  prisma: PrismaService,
  input: ReplaceRolePermissionsInput,
  invalidateRoleHolders: RoleHoldersInvalidationHook = async () => 0,
  // Paket 5.1 (M4 B2): the secret that signed the preview; the write is refused
  // without a matching, unexpired preview (RAW `:231–232`).
  previewSigningSecret = '',
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
  const nextPermissionKeysApplied = await prisma.$transaction(async (transaction) => {
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
    return nextPermissionKeys;
  });
  await invalidateRoleHolders(role.id);
  return nextPermissionKeysApplied;
}
