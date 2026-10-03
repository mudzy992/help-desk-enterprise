import { authenticationConstants } from '../authentication/authentication.constants';
import {
  pickInstallSelectedFields,
  type InMemoryInstallPermission,
  type InMemoryInstallRole,
  type InMemoryInstallRolePermission,
  type InMemoryInstallUser,
  type InMemoryInstallUserRole,
} from './in-memory-install-super-admin.types';

type SuperAdminRoleWhere = {
  userRoles?: { some?: { role?: { key?: string } } };
};

export function createInMemoryInstallSuperAdminPrisma() {
  const users = new Map<string, InMemoryInstallUser>();
  const roles = new Map<string, InMemoryInstallRole>();
  const userRoles: InMemoryInstallUserRole[] = [];
  // Val 0 (finding M4/B1): the install seed now creates system roles with their
  // default permissions, so the harness carries those two tables as well.
  const permissions = new Map<string, InMemoryInstallPermission>();
  const rolePermissions: InMemoryInstallRolePermission[] = [];
  let nextIdentifier = 1;
  const prisma = {
    user: {
      findFirst: async ({
        where,
        select,
      }: {
        where?: SuperAdminRoleWhere;
        select?: Record<string, boolean>;
      }) => {
        const roleKey = where?.userRoles?.some?.role?.key;
        const matched = [...users.values()].find((user) =>
          roleKey === undefined
            ? true
            : userRoles.some((assignment) => {
                const role = roles.get(assignment.roleId);
                return assignment.userId === user.id && role?.key === roleKey;
              }),
        );
        return matched === undefined
          ? null
          : pickInstallSelectedFields(matched, select);
      },
      findUnique: async ({
        where,
        include,
        select,
      }: {
        where: { id?: string; email?: string; entraObjectId?: string };
        include?: {
          userRoles?: { include?: { role?: { select?: { key?: boolean } } } };
        };
        select?: Record<string, boolean>;
      }) => {
        const matched =
          [...users.values()].find((user) => {
            if (where.id !== undefined) {
              return user.id === where.id;
            }
            if (where.email !== undefined) {
              return user.email === where.email;
            }
            return user.entraObjectId === where.entraObjectId;
          }) ?? null;
        if (matched === null) {
          return null;
        }
        if (include?.userRoles === undefined) {
          return pickInstallSelectedFields(matched, select);
        }
        return {
          ...matched,
          userRoles: userRoles
            .filter((assignment) => assignment.userId === matched.id)
            .map((assignment) => ({
              role: { key: roles.get(assignment.roleId)?.key ?? '' },
            })),
        };
      },
      create: async ({
        data,
        select,
      }: {
        data: Omit<InMemoryInstallUser, 'id'> & {
          id?: string;
          userRoles?: { create: { roleId: string } };
        };
        select?: Record<string, boolean>;
      }) => {
        if ([...users.values()].some((user) => user.email === data.email)) {
          throw new Error('Unique constraint failed on email');
        }
        const created: InMemoryInstallUser = {
          id: data.id ?? `user-${nextIdentifier++}`,
          email: data.email,
          displayName: data.displayName,
          isActive: data.isActive,
          isLocalOnly: data.isLocalOnly,
          localPasswordHash: data.localPasswordHash,
          entraObjectId: data.entraObjectId,
        };
        users.set(created.id, created);
        if (data.userRoles !== undefined) {
          userRoles.push({
            id: `user-role-${nextIdentifier++}`,
            userId: created.id,
            roleId: data.userRoles.create.roleId,
          });
        }
        return pickInstallSelectedFields(created, select);
      },
    },
    role: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { key: string };
        select?: Record<string, boolean>;
      }) => {
        const matched =
          [...roles.values()].find((role) => role.key === where.key) ?? null;
        return matched === null
          ? null
          : pickInstallSelectedFields(matched, select);
      },
      create: async ({
        data,
        select,
      }: {
        data: Omit<InMemoryInstallRole, 'id'> & { id?: string };
        select?: Record<string, boolean>;
      }) => {
        const created: InMemoryInstallRole = {
          id: data.id ?? `role-${nextIdentifier++}`,
          key: data.key,
          name: data.name,
          isSystem: data.isSystem,
        };
        roles.set(created.id, created);
        return pickInstallSelectedFields(created, select);
      },
    },
    permission: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { key: string };
        select?: Record<string, boolean>;
      }) => {
        const matched =
          [...permissions.values()].find(
            (permission) => permission.key === where.key,
          ) ?? null;
        return matched === null
          ? null
          : pickInstallSelectedFields(matched, select);
      },
      findMany: async ({
        where,
        select,
      }: {
        where?: { key?: { in?: readonly string[] } };
        select?: Record<string, boolean>;
      }) => {
        const keys = where?.key?.in;
        return [...permissions.values()]
          .filter((permission) =>
            keys === undefined ? true : keys.includes(permission.key),
          )
          .map((permission) => pickInstallSelectedFields(permission, select));
      },
      create: async ({
        data,
        select,
      }: {
        data: Omit<InMemoryInstallPermission, 'id'> & { id?: string };
        select?: Record<string, boolean>;
      }) => {
        const created: InMemoryInstallPermission = {
          id: data.id ?? `permission-${nextIdentifier++}`,
          key: data.key,
        };
        permissions.set(created.id, created);
        return pickInstallSelectedFields(created, select);
      },
    },
    rolePermission: {
      findMany: async ({
        where,
        select,
      }: {
        where: { roleId: string };
        select?: Record<string, boolean>;
      }) =>
        rolePermissions
          .filter((link) => link.roleId === where.roleId)
          .map((link) => pickInstallSelectedFields(link, select)),
      create: async ({
        data,
        select,
      }: {
        data: Omit<InMemoryInstallRolePermission, 'id'> & { id?: string };
        select?: Record<string, boolean>;
      }) => {
        const created: InMemoryInstallRolePermission = {
          id: data.id ?? `role-permission-${nextIdentifier++}`,
          roleId: data.roleId,
          permissionId: data.permissionId,
        };
        rolePermissions.push(created);
        return pickInstallSelectedFields(created, select);
      },
    },
    $transaction: async <T>(
      callback: (client: unknown) => Promise<T>,
    ): Promise<T> => callback(prisma),
  };
  return {
    prisma,
    getRoleByKey: (roleKey: string) =>
      [...roles.values()].find((role) => role.key === roleKey),
    listRolePermissionKeys: (roleKey: string): readonly string[] => {
      const role = [...roles.values()].find((item) => item.key === roleKey);
      if (role === undefined) {
        return [];
      }
      const keys = rolePermissions
        .filter((link) => link.roleId === role.id)
        .map((link) => permissions.get(link.permissionId)?.key)
        .filter((key): key is string => key !== undefined);
      return keys.sort((left, right) => left.localeCompare(right));
    },
    seedUser: (user: InMemoryInstallUser, roleKey?: string) => {
      users.set(user.id, user);
      if (roleKey === undefined) {
        return;
      }
      let role = [...roles.values()].find((item) => item.key === roleKey);
      if (role === undefined) {
        role = {
          id: `role-${nextIdentifier++}`,
          key: roleKey,
          name: roleKey,
          isSystem: roleKey === authenticationConstants.superAdminRoleKey,
        };
        roles.set(role.id, role);
      }
      userRoles.push({
        id: `user-role-${nextIdentifier++}`,
        userId: user.id,
        roleId: role.id,
      });
    },
    getUser: (userId: string) => users.get(userId),
    getUserByEmail: (email: string) =>
      [...users.values()].find((user) => user.email === email),
  };
}
