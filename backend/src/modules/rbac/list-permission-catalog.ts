import { allPermissionKeys } from '../authorization/authorization.constants';

export function listPermissionCatalog(): readonly string[] {
  return allPermissionKeys;
}
