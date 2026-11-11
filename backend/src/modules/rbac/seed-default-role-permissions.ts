import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  authorizationRoleNames,
  defaultRolePermissionKeys,
} from '../authorization/authorization.constants';
import { assertKnownPermissionKeys } from './assert-known-permission-keys';
import { ensurePermissionRows } from './ensure-permission-rows';
import { RbacError } from './rbac.error';

/**
 * Val 0 (finding M4/B1): the default role -> permission mapping
 * (`defaultRolePermissionKeys`) used to live only in the policy packs and in
 * tests — nothing ever wrote it to the database, so a fresh installation ended
 * up with ADMIN/AGENT rows holding zero permissions and every permission-guarded
 * screen answered 403 until an administrator saved the role by hand.
 *
 * This seed writes that mapping the first time roles are created (installation)
 * and lets an existing installation catch up from the CLI
 * (`cli/seed-default-role-permissions.ts`).
 *
 * The operation is additive and idempotent: it creates missing system roles,
 * missing `Permission` rows and missing `RolePermission` links, and never
 * deletes anything. A link an administrator removed on purpose therefore comes
 * back if the CLI is run again — which is why the CLI has `--dry-run` and prints
 * the exact roles and counts it would touch.
 */
export type SeededRolePermissions = {
  readonly roleKey: string;
  readonly roleName: string;
  readonly roleCreated: boolean;
  /** Links the role already had (0 for a newly created role). */
  readonly existing: number;
  /** Links the seed would add (`dryRun`) or did add. */
  readonly added: number;
  readonly addedPermissionKeys: readonly string[];
};

export type SeedDefaultRolePermissionsResult = {
  readonly roles: readonly SeededRolePermissions[];
  readonly addedTotal: number;
};

export type SeedDefaultRolePermissionsOptions = {
  /** Compute the report without writing anything. */
  readonly dryRun?: boolean;
  /** Restrict the seed to these role keys (default: all system roles). */
  readonly roleKeys?: readonly string[];
};

const systemRoleKeys = Object.keys(defaultRolePermissionKeys);

export async function seedDefaultRolePermissions(
  prisma: PrismaService,
  options: SeedDefaultRolePermissionsOptions = {},
): Promise<SeedDefaultRolePermissionsResult> {
  const dryRun = options.dryRun === true;
  const roleKeys = options.roleKeys ?? systemRoleKeys;
  const keysByRole = new Map<string, readonly string[]>();
  const allKeys = new Set<string>();
  for (const roleKey of roleKeys) {
    const keys = assertKnownPermissionKeys(
      defaultRolePermissionKeys[roleKey] ?? [],
    );
    keysByRole.set(roleKey, keys);
    for (const key of keys) {
      allKeys.add(key);
    }
  }

  const idsByKey = await resolvePermissionIds(prisma, [...allKeys], dryRun);

  const roles: SeededRolePermissions[] = [];
  let addedTotal = 0;
  for (const roleKey of roleKeys) {
    const roleName = authorizationRoleNames[roleKey] ?? roleKey;
    const defaults = keysByRole.get(roleKey) ?? [];
    const existingRole = await prisma.role.findUnique({
      where: { key: roleKey },
      select: { id: true },
    });
    const roleId =
      existingRole?.id ??
      (dryRun
        ? null
        : (
            await prisma.role.create({
              data: { key: roleKey, name: roleName, isSystem: true },
              select: { id: true },
            })
          ).id);
    const existingLinks =
      roleId === null
        ? []
        : await prisma.rolePermission.findMany({
            where: { roleId },
            select: { permissionId: true },
          });
    const existingIds = new Set(
      existingLinks.map((link) => link.permissionId),
    );
    const addedPermissionKeys: string[] = [];
    for (const permissionKey of defaults) {
      const permissionId = idsByKey.get(permissionKey);
      // A permission row that does not exist yet (dry run on a fresh database)
      // cannot have a link either, so it counts as "would add".
      if (permissionId !== undefined && existingIds.has(permissionId)) {
        continue;
      }
      if (!dryRun) {
        if (permissionId === undefined || roleId === null) {
          // `ensurePermissionRows` created every row and the role exists after
          // the create above, so this is a broken mapping rather than bad input.
          throw new RbacError('INVALID_PERMISSION_KEY');
        }
        await prisma.rolePermission.create({
          data: { roleId, permissionId },
        });
      }
      addedPermissionKeys.push(permissionKey);
    }
    addedTotal += addedPermissionKeys.length;
    roles.push({
      roleKey,
      roleName,
      roleCreated: existingRole === null,
      existing: existingLinks.length,
      added: addedPermissionKeys.length,
      addedPermissionKeys,
    });
  }

  return { roles, addedTotal };
}

/**
 * Applying the seed resolves/creates the permission rows; the dry run only reads
 * the ones that exist, and reports the rest as "would be created and linked".
 */
async function resolvePermissionIds(
  prisma: PrismaService,
  permissionKeys: readonly string[],
  dryRun: boolean,
): Promise<ReadonlyMap<string, string>> {
  if (!dryRun) {
    return ensurePermissionRows(prisma, permissionKeys);
  }
  const rows = await prisma.permission.findMany({
    where: { key: { in: [...permissionKeys] } },
    select: { id: true, key: true },
  });
  return new Map(rows.map((row) => [row.key, row.id]));
}
