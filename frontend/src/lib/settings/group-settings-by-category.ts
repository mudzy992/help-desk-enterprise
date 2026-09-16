import type { SettingRegistryEntry } from "@/services/settings-api";

export type SettingsCategoryGroup = {
  readonly categoryKey: string;
  readonly categoryIcon: string;
  readonly categoryPriority: number;
  readonly entries: readonly SettingRegistryEntry[];
};

export function groupSettingsByCategory(
  entries: readonly SettingRegistryEntry[],
): readonly SettingsCategoryGroup[] {
  const groups = new Map<string, SettingRegistryEntry[]>();
  const metaByCategory = new Map<
    string,
    { readonly icon: string; readonly priority: number }
  >();
  for (const entry of entries) {
    const categoryKey = entry.categoryId;
    metaByCategory.set(categoryKey, {
      icon: entry.categoryIcon,
      priority: entry.categoryPriority,
    });
    const bucket = groups.get(categoryKey);
    if (bucket === undefined) {
      groups.set(categoryKey, [entry]);
      continue;
    }
    bucket.push(entry);
  }
  return [...groups.entries()]
    .map(([categoryKey, groupEntries]) => {
      const meta = metaByCategory.get(categoryKey);
      return {
        categoryKey,
        categoryIcon: meta?.icon ?? "settings",
        categoryPriority: meta?.priority ?? Number.MAX_SAFE_INTEGER,
        entries: groupEntries,
      };
    })
    .sort((left, right) => {
      if (left.categoryPriority !== right.categoryPriority) {
        return left.categoryPriority - right.categoryPriority;
      }
      return left.categoryKey.localeCompare(right.categoryKey);
    });
}
