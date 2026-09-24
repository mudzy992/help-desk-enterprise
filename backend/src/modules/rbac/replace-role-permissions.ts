import type { PrismaService } from '../../common/prisma/prisma.service';
import { appendAuditLog } from '../audit-log/append-audit-log';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { assertKnownPermissionKeys } from './assert-known-permission-keys';
import { ensurePermissionRows } from './ensure-permission-rows';
import { getRolePermissions } from './get-role-permissions';
import { loadRoleByKey } from './load-role-by-key';
import type { ReplaceRolePermissionsInput } from './rbac.types';

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
): Promise<readonly string[]> {
  const role = await loadRoleByKey(prisma, input.roleKey);
  const previousPermissionKeys = await getRolePermissions(prisma, role.key);
  const nextPermissionKeys = assertKnownPermissionKeys(input.permissionKeys);
  const nextPermissionKeysApplied = await prisma.$transaction(async (transaction) => {
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
      },
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
    return nextPermissionKeys;
  });
  await invalidateRoleHolders(role.id);
  return nextPermissionKeysApplied;
}
