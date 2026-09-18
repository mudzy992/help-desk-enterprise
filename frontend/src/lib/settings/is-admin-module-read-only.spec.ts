import { describe, expect, it } from "vitest";
import {
  adminReadOnlyModuleKeys,
  isAdminModuleReadOnly,
} from "@/lib/settings/is-admin-module-read-only";
import type { SettingRegistryEntry } from "@/services/settings-api";

function entry(
  key: string,
  value: string | boolean,
): SettingRegistryEntry {
  return {
    key,
    description: key,
    categoryId: "private.readOnlyMode",
    categoryIcon: "lock",
    categoryPriority: 1,
    valueType: typeof value === "boolean" ? "boolean" : "string",
    visibility: "private",
    isRequired: false,
    defaultValue: value,
    value,
    isSet: true,
  };
}

describe("isAdminModuleReadOnly", () => {
  it("returns false when master switch is off", () => {
    const entries = [
      entry("private.readOnlyMode.enabled", false),
      entry("private.readOnlyMode.modulesCsv", "service_catalog"),
      entry("private.readOnlyMode.activeModulesCsv", "service_catalog"),
    ];
    expect(
      isAdminModuleReadOnly(entries, adminReadOnlyModuleKeys.serviceCatalog),
    ).toBe(false);
  });

  it("locks service_catalog when listed in active modules", () => {
    const entries = [
      entry("private.readOnlyMode.enabled", true),
      entry(
        "private.readOnlyMode.modulesCsv",
        "admin,settings,routing,service_catalog,service_forms,sla",
      ),
      entry("private.readOnlyMode.activeModulesCsv", "service_catalog"),
    ];
    expect(
      isAdminModuleReadOnly(entries, adminReadOnlyModuleKeys.serviceCatalog),
    ).toBe(true);
    expect(
      isAdminModuleReadOnly(entries, adminReadOnlyModuleKeys.serviceForms),
    ).toBe(true);
    expect(isAdminModuleReadOnly(entries, adminReadOnlyModuleKeys.sla)).toBe(
      false,
    );
  });

  it("locks every module when admin is active", () => {
    const entries = [
      entry("private.readOnlyMode.enabled", true),
      entry(
        "private.readOnlyMode.modulesCsv",
        "admin,settings,routing,service_catalog,service_forms,sla",
      ),
      entry("private.readOnlyMode.activeModulesCsv", "admin"),
    ];
    expect(
      isAdminModuleReadOnly(entries, adminReadOnlyModuleKeys.serviceCatalog),
    ).toBe(true);
  });
});
