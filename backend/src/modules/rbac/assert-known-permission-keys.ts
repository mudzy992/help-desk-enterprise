import { allPermissionKeys } from '../authorization/authorization.constants';
import { RbacError } from './rbac.error';

const catalog = new Set<string>(allPermissionKeys);

export function assertKnownPermissionKeys(
  permissionKeys: readonly string[],
): readonly string[] {
  const normalized = [...new Set(permissionKeys.map((key) => key.trim()))]
    .filter((key) => key.length > 0)
    .sort((left, right) => left.localeCompare(right));
  for (const permissionKey of normalized) {
    if (!catalog.has(permissionKey)) {
      throw new RbacError('INVALID_PERMISSION_KEY');
    }
  }
  return normalized;
}
