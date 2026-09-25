import { allPermissionKeys } from '../authorization/authorization.constants';
import {
  permissionCatalogEntries,
  permissionCategoryIds,
} from '../authorization/permission-catalog';
import { listPermissionCatalog } from './list-permission-catalog';

describe('listPermissionCatalog', () => {
  it('returns an entry with non-empty description for every permission key', () => {
    const catalog = listPermissionCatalog();
    const knownCategories = new Set(Object.values(permissionCategoryIds));
    expect(catalog).toHaveLength(allPermissionKeys.length);
    expect(allPermissionKeys).toHaveLength(32);
    expect(catalog).toBe(permissionCatalogEntries);
    const catalogKeys = catalog.map((entry) => entry.key);
    expect(catalogKeys.sort()).toEqual([...allPermissionKeys].sort());
    for (const entry of catalog) {
      expect(entry.description.trim().length).toBeGreaterThan(0);
      expect(knownCategories.has(entry.categoryId)).toBe(true);
    }
  });
});
