import { createInMemoryPolicyPackDelegates } from './create-in-memory-policy-pack-delegates';
import type {
  InMemoryPermissionRecord,
  InMemoryPolicyPackOrganizationalUnit,
  InMemoryPolicyPackService,
  InMemoryPolicyPackStores,
  InMemoryPolicyPackUser,
  InMemoryRolePermissionRecord,
  InMemoryRoleRecord,
  InMemoryUserRole,
} from './in-memory-policy-pack.types';
import { mapInMemoryPolicyPackAssignments } from './map-in-memory-policy-pack-assignments';

export function createInMemoryPolicyPackPrisma() {
  const stores: InMemoryPolicyPackStores = {
    users: new Map(),
    units: new Map(),
    services: new Map(),
    roles: new Map(),
    permissions: new Map(),
    rolePermissions: [],
    userRoles: [],
    policyPacks: new Map(),
  };
  let nextIdentifier = 1;
  const nextId = (prefix: string) => `${prefix}-${nextIdentifier++}`;
  const delegates = createInMemoryPolicyPackDelegates(stores, nextId);
  const prisma: ReturnType<typeof createInMemoryPolicyPackDelegates> & {
    $transaction: (
      callback: (client: unknown) => Promise<unknown>,
    ) => Promise<unknown>;
  } = {
    ...delegates,
    $transaction: async (callback) => callback(prisma),
  };

  return {
    prisma,
    seedUser: (user: InMemoryPolicyPackUser) => stores.users.set(user.id, user),
    seedOrganizationalUnit: (unit: InMemoryPolicyPackOrganizationalUnit) =>
      stores.units.set(unit.id, unit),
    seedService: (service: InMemoryPolicyPackService) =>
      stores.services.set(service.id, service),
    seedRole: (role: InMemoryRoleRecord) => stores.roles.set(role.id, role),
    seedPermission: (permission: InMemoryPermissionRecord) =>
      stores.permissions.set(permission.id, permission),
    seedRolePermission: (record: InMemoryRolePermissionRecord) =>
      stores.rolePermissions.push(record),
    seedUserRole: (record: InMemoryUserRole) => stores.userRoles.push(record),
    getOrganizationalUnit: (id: string) => stores.units.get(id),
    getService: (id: string) => stores.services.get(id),
    listUserRoles: () => [...stores.userRoles],
    listRolePermissions: () => [...stores.rolePermissions],
    listRoles: () => [...stores.roles.values()],
    assignmentsForUser: (userId: string) =>
      mapInMemoryPolicyPackAssignments(stores, userId),
    getUser: (userId: string) => stores.users.get(userId),
  };
}
