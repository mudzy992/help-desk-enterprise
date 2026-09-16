import type { SettingRegistryEntry } from "@/services/settings-api";

export type SettingsCategoryGroup = {
  readonly categoryKey: string;
  readonly entries: readonly SettingRegistryEntry[];
};

export function groupSettingsByCategory(
  entries: readonly SettingRegistryEntry[],
): readonly SettingsCategoryGroup[] {
  const groups = new Map<string, SettingRegistryEntry[]>();
  for (const entry of entries) {
    const categoryKey = readCategoryKey(entry.key);
    const bucket = groups.get(categoryKey);
    if (bucket === undefined) {
      groups.set(categoryKey, [entry]);
      continue;
    }
    bucket.push(entry);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([categoryKey, groupEntries]) => ({
      categoryKey,
      entries: groupEntries,
    }));
}

function readCategoryKey(key: string): string {
  const parts = key.split(".");
  if (parts.length < 2) {
    return key;
  }
  return `${parts[0]}.${parts[1]}`;
}
