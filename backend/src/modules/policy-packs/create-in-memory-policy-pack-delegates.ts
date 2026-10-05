import type {
  InMemoryPermissionRecord,
  InMemoryPolicyPackRecord,
  InMemoryPolicyPackStores,
  InMemoryRolePermissionRecord,
  InMemoryRoleRecord,
  InMemoryUserRole,
  InMemorySlaProfileRecord,
} from './in-memory-policy-pack.types';

function sameNullable(left: string | null, right: string | null): boolean {
  return left === right;
}

export function createInMemoryPolicyPackDelegates(
  stores: InMemoryPolicyPackStores,
  nextId: (prefix: string) => string,
) {
  return {
    organizationalUnit: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: { id?: boolean; ouPath?: boolean; policyPackId?: boolean };
      }) => {
        const unit = stores.units.get(where.id) ?? null;
        if (unit === null || select === undefined) {
          return unit;
        }
        return {
          ...(select.id === true ? { id: unit.id } : {}),
          ...(select.ouPath === true ? { ouPath: unit.ouPath } : {}),
          ...(select.policyPackId === true
            ? { policyPackId: unit.policyPackId }
            : {}),
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { policyPackId: string | null };
      }) => {
        const unit = stores.units.get(where.id);
        if (unit === undefined) {
          return null;
        }
        unit.policyPackId = data.policyPackId;
        return unit;
      },
    },
    service: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: {
          id?: boolean;
          policyPackId?: boolean;
          classification?: boolean;
          requiresApproval?: boolean;
          slaProfileId?: boolean;
        };
      }) => {
        const service = stores.services.get(where.id) ?? null;
        if (service === null || select === undefined) {
          return service;
        }
        return {
          ...(select.id === true ? { id: service.id } : {}),
          ...(select.policyPackId === true
            ? { policyPackId: service.policyPackId }
            : {}),
          ...(select.classification === true
            ? { classification: service.classification ?? null }
            : {}),
          ...(select.requiresApproval === true
            ? { requiresApproval: service.requiresApproval ?? null }
            : {}),
          ...(select.slaProfileId === true
            ? { slaProfileId: service.slaProfileId ?? null }
            : {}),
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          policyPackId?: string | null;
          classification?: string;
          requiresApproval?: boolean;
          slaProfileId?: string | null;
        };
      }) => {
        const service = stores.services.get(where.id);
        if (service === undefined) {
          return null;
        }
        if (data.policyPackId !== undefined) {
          service.policyPackId = data.policyPackId;
        }
        if (data.classification !== undefined) {
          service.classification = data.classification;
        }
        if (data.requiresApproval !== undefined) {
          service.requiresApproval = data.requiresApproval;
        }
        if (data.slaProfileId !== undefined) {
          service.slaProfileId = data.slaProfileId;
        }
        return service;
      },
    },
    slaProfile: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        [...stores.slaProfiles.values()].find(
          (profile) => profile.key === where.key,
        ) ?? null,
    },
    user: {
      findMany: async ({
        where,
      }: {
        where: { id: { in: readonly string[] } };
      }) =>
        where.id.in
          .map((id) => stores.users.get(id))
          .filter((user) => user !== undefined),
    },
    role: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        [...stores.roles.values()].find((role) => role.key === where.key) ??
        null,
      create: async ({
        data,
      }: {
        data: { key: string; name: string; isSystem: boolean };
      }) => {
        const created: InMemoryRoleRecord = {
          id: nextId('role'),
          key: data.key,
        };
        stores.roles.set(created.id, created);
        return created;
      },
    },
    permission: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        [...stores.permissions.values()].find(
          (item) => item.key === where.key,
        ) ?? null,
      create: async ({
        data,
      }: {
        data: { key: string; description: string };
      }) => {
        const created: InMemoryPermissionRecord = {
          id: nextId('permission'),
          key: data.key,
        };
        stores.permissions.set(created.id, created);
        return created;
      },
    },
    rolePermission: {
      findUnique: async ({
        where,
      }: {
        where: { roleId_permissionId: { roleId: string; permissionId: string } };
      }) =>
        stores.rolePermissions.find(
          (item) =>
            item.roleId === where.roleId_permissionId.roleId &&
            item.permissionId === where.roleId_permissionId.permissionId,
        ) ?? null,
      create: async ({
        data,
      }: {
        data: { roleId: string; permissionId: string };
      }) => {
        const created: InMemoryRolePermissionRecord = {
          id: nextId('role-permission'),
          ...data,
        };
        stores.rolePermissions.push(created);
        return created;
      },
    },
    userRole: {
      findFirst: async ({
        where,
      }: {
        where: {
          userId: string;
          roleId: string;
          organizationalUnitId: string | null;
          serviceId: string | null;
        };
      }) =>
        stores.userRoles.find(
          (item) =>
            item.userId === where.userId &&
            item.roleId === where.roleId &&
            sameNullable(item.organizationalUnitId, where.organizationalUnitId) &&
            sameNullable(item.serviceId, where.serviceId),
        ) ?? null,
      create: async ({ data }: { data: Omit<InMemoryUserRole, 'id'> }) => {
        const created = { id: nextId('user-role'), ...data };
        stores.userRoles.push(created);
        return created;
      },
      findMany: async () => [...stores.userRoles],
      deleteMany: async ({
        where,
      }: {
        where: {
          userId: string;
          roleId: string;
          organizationalUnitId: string | null;
          serviceId: string | null;
        };
      }) => {
        const kept = stores.userRoles.filter(
          (item) =>
            !(
              item.userId === where.userId &&
              item.roleId === where.roleId &&
              sameNullable(
                item.organizationalUnitId,
                where.organizationalUnitId,
              ) &&
              sameNullable(item.serviceId, where.serviceId)
            ),
        );
        const count = stores.userRoles.length - kept.length;
        stores.userRoles.length = 0;
        stores.userRoles.push(...kept);
        return { count };
      },
    },
    policyPack: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { key: string };
        create: Omit<InMemoryPolicyPackRecord, 'id'>;
        update: Omit<InMemoryPolicyPackRecord, 'id' | 'key'>;
      }) => {
        const existing = [...stores.policyPacks.values()].find(
          (item) => item.key === where.key,
        );
        if (existing !== undefined) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { id: nextId('policy-pack'), ...create };
        stores.policyPacks.set(created.id, created);
        return created;
      },
    },
  };
}
