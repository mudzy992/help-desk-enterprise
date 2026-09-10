import { PrismaService } from '../../common/prisma/prisma.service';
import type { PolicyPackDefinition } from './policy-pack.types';
import { sortPolicyPackTokens } from './sort-policy-pack-tokens';

export type PolicyPackCatalogEnsureResult = {
  readonly policyPackId: string;
  readonly createdRolePermissionCount: number;
  readonly existingRolePermissionCount: number;
  readonly roleIdsByKey: ReadonlyMap<string, string>;
};

async function ensureRole(
  prisma: PrismaService,
  roleKey: string,
): Promise<string> {
  const existing = await prisma.role.findUnique({
    where: { key: roleKey },
    select: { id: true },
  });
  if (existing !== null) {
    return existing.id;
  }
  const created = await prisma.role.create({
    data: { key: roleKey, name: roleKey, isSystem: true },
    select: { id: true },
  });
  return created.id;
}

async function ensurePermission(
  prisma: PrismaService,
  permissionKey: string,
): Promise<string> {
  const existing = await prisma.permission.findUnique({
    where: { key: permissionKey },
    select: { id: true },
  });
  if (existing !== null) {
    return existing.id;
  }
  const created = await prisma.permission.create({
    data: { key: permissionKey, description: permissionKey },
    select: { id: true },
  });
  return created.id;
}

export async function ensurePolicyPackCatalog(
  prisma: PrismaService,
  pack: PolicyPackDefinition,
): Promise<PolicyPackCatalogEnsureResult> {
  const persisted = await prisma.policyPack.upsert({
    where: { key: pack.key },
    create: {
      key: pack.key,
      name: pack.name,
      description: pack.description,
      defaultClassification: pack.defaultClassification,
      requiresApproval: pack.requiresApproval,
    },
    update: {
      name: pack.name,
      description: pack.description,
      defaultClassification: pack.defaultClassification,
      requiresApproval: pack.requiresApproval,
    },
    select: { id: true },
  });
  const roleIdsByKey = new Map<string, string>();
  let createdRolePermissionCount = 0;
  let existingRolePermissionCount = 0;
  const roleKeys = sortPolicyPackTokens(pack.grants.map((grant) => grant.roleKey));
  for (const roleKey of roleKeys) {
    roleIdsByKey.set(roleKey, await ensureRole(prisma, roleKey));
  }
  for (const grant of pack.grants) {
    const roleId = roleIdsByKey.get(grant.roleKey);
    if (roleId === undefined) {
      continue;
    }
    for (const permissionKey of sortPolicyPackTokens([...grant.permissionKeys])) {
      const permissionId = await ensurePermission(prisma, permissionKey);
      const existing = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: { roleId, permissionId },
        },
        select: { id: true },
      });
      if (existing !== null) {
        existingRolePermissionCount += 1;
        continue;
      }
      await prisma.rolePermission.create({
        data: { roleId, permissionId },
      });
      createdRolePermissionCount += 1;
    }
  }
  return {
    policyPackId: persisted.id,
    createdRolePermissionCount,
    existingRolePermissionCount,
    roleIdsByKey,
  };
}
