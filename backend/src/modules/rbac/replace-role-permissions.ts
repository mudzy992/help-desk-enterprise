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
import { verifyRolePermissionPreviewToken } from './role-permission-preview-token';
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
  const nextPermissionKeys = assertKnownPermissionKeys(input.permissionKeys);
  const mutation = await prisma.$transaction(async (transaction) => {
    // The same transaction lock protects admin availability and the permission
    // matrix. Reads which decide whether a mutation is safe must happen only
    // after this point, otherwise two callers can both pass a stale preflight.
    await lockActiveSuperAdminInvariant(transaction);
    const role = await loadRoleByKey(transaction as PrismaService, input.roleKey);
    if (role.key === authorizationRoleKeys.superAdmin) {
      // Runtime SuperAdmin authority is intentionally the full catalog. Letting
      // this row be edited creates a deceptive matrix with no runtime effect.
      throw new RbacError('SYSTEM_ROLE_PERMISSIONS_IMMUTABLE');
    }
    const previousPermissionKeys = await getRolePermissions(
      transaction as PrismaService,
      role.key,
    );
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
    return { roleId: role.id, permissionKeys: nextPermissionKeys };
  });
  await invalidateRoleHolders(mutation.roleId);
  return mutation.permissionKeys;
}
