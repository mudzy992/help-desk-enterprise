import {
  permissionCatalogEntries,
  type PermissionCatalogEntry,
} from '../authorization/permission-catalog';

export function listPermissionCatalog(): readonly PermissionCatalogEntry[] {
  return permissionCatalogEntries;
}
