import { describe, expect, it } from "vitest";
import { groupSettingsByCategory } from "@/lib/settings/group-settings-by-category";
import type { SettingRegistryEntry } from "@/services/settings-api";

function entry(
  partial: Pick<
    SettingRegistryEntry,
    "key" | "categoryId" | "categoryIcon" | "categoryPriority"
  >,
): SettingRegistryEntry {
  return {
    description: "test",
    valueType: "boolean",
    visibility: "private",
    isRequired: true,
    defaultValue: false,
    value: false,
    isSet: true,
    ...partial,
  };
}

describe("groupSettingsByCategory", () => {
  it("groups by categoryId and sorts by priority then id", () => {
    const groups = groupSettingsByCategory([
      entry({
        key: "private.ticket.sla.enabled",
        categoryId: "private.ticket",
        categoryIcon: "ticket",
        categoryPriority: 80,
      }),
      entry({
        key: "public.maintenance.enabled",
        categoryId: "public.maintenance",
        categoryIcon: "wrench",
        categoryPriority: 20,
      }),
      entry({
        key: "private.ticket.reopen.enabled",
        categoryId: "private.ticket",
        categoryIcon: "ticket",
        categoryPriority: 80,
      }),
      entry({
        key: "public.branding.appName",
        categoryId: "public.branding",
        categoryIcon: "sparkles",
        categoryPriority: 10,
      }),
    ]);
    expect(groups.map((group) => group.categoryKey)).toEqual([
      "public.branding",
      "public.maintenance",
      "private.ticket",
    ]);
    expect(groups[0]?.categoryIcon).toBe("sparkles");
    expect(groups[2]?.entries).toHaveLength(2);
  });
});
