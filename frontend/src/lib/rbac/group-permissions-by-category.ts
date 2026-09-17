import type { PermissionCatalogEntry } from "@/services/rbac-api";

export type PermissionCategoryGroup = {
  readonly categoryId: string;
  readonly entries: readonly PermissionCatalogEntry[];
};

export function groupPermissionsByCategory(
  entries: readonly PermissionCatalogEntry[],
): readonly PermissionCategoryGroup[] {
  const groups = new Map<string, PermissionCatalogEntry[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.categoryId);
    if (bucket === undefined) {
      groups.set(entry.categoryId, [entry]);
      continue;
    }
    bucket.push(entry);
  }
  return [...groups.entries()]
    .map(([categoryId, groupEntries]) => ({
      categoryId,
      entries: [...groupEntries].sort((left, right) =>
        left.key.localeCompare(right.key),
      ),
    }))
    .sort((left, right) => left.categoryId.localeCompare(right.categoryId));
}
