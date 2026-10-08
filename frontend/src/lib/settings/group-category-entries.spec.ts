import { describe, expect, it } from "vitest";
import { groupCategoryEntries } from "@/lib/settings/group-category-entries";
import type { SettingRegistryEntry } from "@/services/settings-api";

function entry(key: string, group: string | null): SettingRegistryEntry {
  return {
    key,
    description: "test",
    categoryId: "private.smtp",
    categoryIcon: "mail",
    categoryPriority: 100,
    valueType: "string",
    visibility: "private",
    isRequired: false,
    defaultValue: "",
    value: "",
    isSet: false,
    titleKey: `settings.registry.keys.${key}`,
    helpKey: `settings.registry.help.${key}`,
    group,
    requires: [],
  };
}

describe("groupCategoryEntries", () => {
  it("keeps the declaration order of groups and the registry order inside them", () => {
    const groups = groupCategoryEntries([
      entry("smtp.host", "connection"),
      entry("smtp.port", "connection"),
      entry("smtp.username", "authentication"),
      entry("smtp.password", "authentication"),
      entry("smtp.fromAddress", "sender"),
    ]);
    expect(groups.map((group) => group.groupId)).toEqual([
      "connection",
      "authentication",
      "sender",
    ]);
    expect(groups[0]?.entries.map((item) => item.key)).toEqual([
      "smtp.host",
      "smtp.port",
    ]);
  });

  it("puts ungrouped entries last, whatever their position", () => {
    const groups = groupCategoryEntries([
      entry("smtp.enabled", null),
      entry("smtp.host", "connection"),
      entry("smtp.provider", "connection"),
      entry("smtp.note", null),
    ]);
    expect(groups.map((group) => group.groupId)).toEqual(["connection", null]);
    expect(groups[1]?.entries.map((item) => item.key)).toEqual([
      "smtp.enabled",
      "smtp.note",
    ]);
  });

  it("returns a single ungrouped bucket when nothing declares a group", () => {
    const groups = groupCategoryEntries([entry("a", null), entry("b", "  ")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.groupId).toBeNull();
    expect(groups[0]?.entries).toHaveLength(2);
  });
});
