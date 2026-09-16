import type { SettingRegistryEntry } from "@/services/settings-api";

export function findSettingEntry(
  entries: readonly SettingRegistryEntry[],
  key: string,
): SettingRegistryEntry | null {
  return entries.find((entry) => entry.key === key) ?? null;
}

export function readBooleanSetting(
  entries: readonly SettingRegistryEntry[],
  key: string,
  fallback = false,
): boolean {
  const entry = findSettingEntry(entries, key);
  if (entry === null) {
    return fallback;
  }
  if (typeof entry.value === "boolean") {
    return entry.value;
  }
  if (typeof entry.defaultValue === "boolean") {
    return entry.defaultValue;
  }
  return fallback;
}

export function readStringSetting(
  entries: readonly SettingRegistryEntry[],
  key: string,
  fallback = "",
): string {
  const entry = findSettingEntry(entries, key);
  if (entry === null) {
    return fallback;
  }
  if (typeof entry.value === "string" && entry.value.length > 0) {
    return entry.value;
  }
  if (typeof entry.defaultValue === "string") {
    return entry.defaultValue;
  }
  return fallback;
}

export function filterSettingsByPrefix(
  entries: readonly SettingRegistryEntry[],
  prefix: string,
): readonly SettingRegistryEntry[] {
  return entries.filter((entry) => entry.key.startsWith(prefix));
}

export function filterSettingsByKeys(
  entries: readonly SettingRegistryEntry[],
  keys: readonly string[],
): readonly SettingRegistryEntry[] {
  const allowed = new Set(keys);
  return entries.filter((entry) => allowed.has(entry.key));
}
