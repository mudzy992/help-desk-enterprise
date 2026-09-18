import {
  readBooleanSetting,
  readStringSetting,
} from "@/lib/settings/read-setting-entry";
import type { SettingRegistryEntry } from "@/services/settings-api";

export const adminReadOnlyModuleKeys = {
  admin: "admin",
  settings: "settings",
  routing: "routing",
  serviceCatalog: "service_catalog",
  serviceForms: "service_forms",
  sla: "sla",
} as const;

export type AdminReadOnlyModuleKey =
  (typeof adminReadOnlyModuleKeys)[keyof typeof adminReadOnlyModuleKeys];

const readOnlySettingKeys = {
  enabled: "private.readOnlyMode.enabled",
  modulesCsv: "private.readOnlyMode.modulesCsv",
  activeModulesCsv: "private.readOnlyMode.activeModulesCsv",
} as const;

function parseCsvTokens(value: string): readonly string[] {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export function isAdminModuleReadOnly(
  entries: readonly SettingRegistryEntry[],
  moduleKey: AdminReadOnlyModuleKey,
): boolean {
  if (!readBooleanSetting(entries, readOnlySettingKeys.enabled, true)) {
    return false;
  }
  const lockable = new Set(
    parseCsvTokens(readStringSetting(entries, readOnlySettingKeys.modulesCsv)),
  );
  const active = parseCsvTokens(
    readStringSetting(entries, readOnlySettingKeys.activeModulesCsv),
  ).filter((key) => lockable.has(key));
  if (active.includes(adminReadOnlyModuleKeys.admin)) {
    return true;
  }
  if (active.includes(moduleKey)) {
    return true;
  }
  return (
    moduleKey === adminReadOnlyModuleKeys.serviceForms &&
    active.includes(adminReadOnlyModuleKeys.serviceCatalog)
  );
}
