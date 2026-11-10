import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  authorizationRoleKeys,
  defaultRolePermissionKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { seedDefaultRolePermissions } from './seed-default-role-permissions';

type FakeRole = { id: string; key: string; name: string; isSystem: boolean };
type FakePermission = { id: string; key: string };
type FakeRolePermission = { id: string; roleId: string; permissionId: string };

function createFakePrisma(input?: {
  readonly roles?: readonly { key: string; name?: string }[];
  readonly permissions?: readonly string[];
  readonly links?: readonly { roleKey: string; permissionKey: string }[];
}) {
  const roles = new Map<string, FakeRole>();
  const permissions = new Map<string, FakePermission>();
  const rolePermissions: FakeRolePermission[] = [];
  let next = 1;
  for (const role of input?.roles ?? []) {
    const id = `role-${next++}`;
    roles.set(id, {
      id,
      key: role.key,
      name: role.name ?? role.key,
      isSystem: true,
    });
  }
  for (const key of input?.permissions ?? []) {
    const id = `permission-${next++}`;
    permissions.set(id, { id, key });
  }
  for (const link of input?.links ?? []) {
    const role = [...roles.values()].find((row) => row.key === link.roleKey);
    const permission = [...permissions.values()].find(
      (row) => row.key === link.permissionKey,
    );
    if (role !== undefined && permission !== undefined) {
      rolePermissions.push({
        id: `link-${next++}`,
        roleId: role.id,
        permissionId: permission.id,
      });
    }
  }
  const prisma = {
    role: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        [...roles.values()].find((role) => role.key === where.key) ?? null,
      create: async ({
        data,
      }: {
        data: { key: string; name: string; isSystem: boolean };
      }) => {
        const id = `role-${next++}`;
        const created = { id, ...data };
        roles.set(id, created);
        return created;
      },
    },
    permission: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        [...permissions.values()].find((row) => row.key === where.key) ?? null,
      findMany: async ({
        where,
      }: {
        where?: { key?: { in?: readonly string[] } };
      }) => {
        const keys = where?.key?.in;
        return [...permissions.values()].filter((row) =>
          keys === undefined ? true : keys.includes(row.key),
        );
      },
      create: async ({ data }: { data: { key: string } }) => {
        const id = `permission-${next++}`;
        const created = { id, key: data.key };
        permissions.set(id, created);
        return created;
      },
    },
    rolePermission: {
      findMany: async ({ where }: { where: { roleId: string } }) =>
        rolePermissions.filter((link) => link.roleId === where.roleId),
      create: async ({
        data,
      }: {
        data: { roleId: string; permissionId: string };
      }) => {
        if (
          rolePermissions.some(
            (link) =>
              link.roleId === data.roleId &&
              link.permissionId === data.permissionId,
          )
        ) {
          throw new Error('Unique constraint failed');
        }
        const created = { id: `link-${next++}`, ...data };
        rolePermissions.push(created);
        return created;
      },
    },
  };
  return {
    prisma: prisma as unknown as PrismaService,
    permissionKeysOf: (roleKey: string): readonly string[] => {
      const role = [...roles.values()].find((item) => item.key === roleKey);
      if (role === undefined) {
        return [];
      }
      return rolePermissions
        .filter((link) => link.roleId === role.id)
        .map(
          (link) =>
            [...permissions.values()].find(
              (row) => row.id === link.permissionId,
            )?.key ?? '',
        )
        .sort((left, right) => left.localeCompare(right));
    },
    roleNames: (): readonly string[] =>
      [...roles.values()].map((role) => `${role.key}=${role.name}`).sort(),
  };
}

describe('seedDefaultRolePermissions', () => {
  it('creates the seven system roles with their default permissions on an empty database', async () => {
    const fake = createFakePrisma();
    const result = await seedDefaultRolePermissions(fake.prisma);

    expect(result.addedTotal).toBeGreaterThan(0);
    expect(fake.roleNames()).toEqual(
      [
        `${authorizationRoleKeys.admin}=Admin`,
        `${authorizationRoleKeys.agent}=Agent`,
        `${authorizationRoleKeys.assetManager}=AssetManager`,
        `${authorizationRoleKeys.changeManager}=ChangeManager`,
        `${authorizationRoleKeys.problemManager}=ProblemManager`,
        `${authorizationRoleKeys.superAdmin}=SuperAdmin`,
        `${authorizationRoleKeys.user}=User`,
      ].sort(),
    );
    for (const roleKey of Object.keys(defaultRolePermissionKeys)) {
      const expected = [...(defaultRolePermissionKeys[roleKey] ?? [])].sort(
        (left, right) => left.localeCompare(right),
      );
      const actual = [...fake.permissionKeysOf(roleKey)].sort((left, right) =>
        left.localeCompare(right),
      );
      expect(actual).toEqual([...new Set(expected)]);
    }
    // The roles the finding names explicitly must not be left empty.
    expect(fake.permissionKeysOf(authorizationRoleKeys.agent)).toContain(
      permissionKeys.knowledgeArticleWrite,
    );
    expect(fake.permissionKeysOf(authorizationRoleKeys.admin)).toContain(
      permissionKeys.settingsWrite,
    );
    expect(fake.permissionKeysOf(authorizationRoleKeys.user)).toEqual(
      [...(defaultRolePermissionKeys[authorizationRoleKeys.user] ?? [])].sort(
        (left, right) => left.localeCompare(right),
      ),
    );
  });

  it('is additive and idempotent: a second run adds nothing', async () => {
    const fake = createFakePrisma();
    await seedDefaultRolePermissions(fake.prisma);
    const second = await seedDefaultRolePermissions(fake.prisma);
    expect(second.addedTotal).toBe(0);
    expect(second.roles.every((role) => !role.roleCreated)).toBe(true);
  });

  it('keeps an existing link, never duplicates it, and adds the missing defaults', async () => {
    const fake = createFakePrisma({
      roles: [{ key: authorizationRoleKeys.agent, name: 'Agent' }],
      permissions: [permissionKeys.knowledgeArticleWrite],
      links: [
        {
          roleKey: authorizationRoleKeys.agent,
          permissionKey: permissionKeys.knowledgeArticleWrite,
        },
      ],
    });
    const result = await seedDefaultRolePermissions(fake.prisma, {
      roleKeys: [authorizationRoleKeys.agent],
    });

    const role = result.roles[0];
    expect(role.roleCreated).toBe(false);
    expect(role.existing).toBe(1);
    expect(role.addedPermissionKeys).not.toContain(
      permissionKeys.knowledgeArticleWrite,
    );
    const keys = fake.permissionKeysOf(authorizationRoleKeys.agent);
    expect(keys).toContain(permissionKeys.knowledgeArticleWrite);
    expect(
      keys.filter((key) => key === permissionKeys.knowledgeArticleWrite),
    ).toHaveLength(1);
    expect(keys).toHaveLength(role.existing + role.added);
  });

  it('writes nothing in a dry run but reports what would be added', async () => {
    const fake = createFakePrisma();
    const result = await seedDefaultRolePermissions(fake.prisma, {
      dryRun: true,
    });
    expect(result.addedTotal).toBeGreaterThan(0);
    expect(fake.roleNames()).toEqual([]);
    expect(fake.permissionKeysOf(authorizationRoleKeys.admin)).toEqual([]);
  });
});
