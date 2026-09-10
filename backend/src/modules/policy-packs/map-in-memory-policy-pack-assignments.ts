import type { AuthorizationAssignment } from '../authorization/authorization.types';
import type { InMemoryPolicyPackStores } from './in-memory-policy-pack.types';

export function mapInMemoryPolicyPackAssignments(
  stores: InMemoryPolicyPackStores,
  userId: string,
): readonly AuthorizationAssignment[] {
  return stores.userRoles
    .filter((item) => item.userId === userId)
    .map((item) => {
      const role = stores.roles.get(item.roleId);
      const permissionKeys = stores.rolePermissions
        .filter((link) => link.roleId === item.roleId)
        .map((link) => stores.permissions.get(link.permissionId)?.key)
        .filter((key): key is string => key !== undefined);
      const unit =
        item.organizationalUnitId === null
          ? null
          : stores.units.get(item.organizationalUnitId) ?? null;
      return {
        roleKey: role?.key ?? '',
        permissionKeys,
        organizationalUnitId: item.organizationalUnitId,
        organizationalUnitPath: unit?.ouPath ?? null,
        serviceId: item.serviceId,
      };
    });
}
