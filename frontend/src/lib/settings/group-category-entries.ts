import type { SettingRegistryEntry } from "@/services/settings-api";

/**
 * Paket 5.3.4 (D4/D5): inside a category, settings that belong together are
 * shown together — "Veza", "Autentikacija", "Pošiljalac" for SMTP. The group id
 * is declared on the definition and resolves to a title through
 * `settings.registry.groups.<categoryId>.<groupId>`; a definition without a
 * group lands in the category itself, after the named groups, so the order is
 * stable (registry order inside every bucket).
 */
export type SettingsEntryGroup = {
  /** `null` for the entries that carry no group id. */
  readonly groupId: string | null;
  readonly entries: readonly SettingRegistryEntry[];
};

export function groupCategoryEntries(
  entries: readonly SettingRegistryEntry[],
): readonly SettingsEntryGroup[] {
  const buckets = new Map<string, SettingRegistryEntry[]>();
  const ungrouped: SettingRegistryEntry[] = [];
  for (const entry of entries) {
    if (entry.group === null || entry.group.trim().length === 0) {
      ungrouped.push(entry);
      continue;
    }
    const bucket = buckets.get(entry.group);
    if (bucket === undefined) {
      buckets.set(entry.group, [entry]);
      continue;
    }
    bucket.push(entry);
  }
  const groups: SettingsEntryGroup[] = [...buckets.entries()].map(
    ([groupId, groupEntries]) => ({ groupId, entries: groupEntries }),
  );
  if (ungrouped.length > 0) {
    groups.push({ groupId: null, entries: ungrouped });
  }
  return groups;
}

/** How many entries a search would leave visible; used for the counts on chips. */
export function countEntriesMatching(
  entries: readonly SettingRegistryEntry[],
  predicate: (entry: SettingRegistryEntry) => boolean,
): number {
  return entries.filter(predicate).length;
}
