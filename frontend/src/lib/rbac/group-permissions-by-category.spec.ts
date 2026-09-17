import { describe, expect, it } from "vitest";
import { groupPermissionsByCategory } from "@/lib/rbac/group-permissions-by-category";
import type { PermissionCatalogEntry } from "@/services/rbac-api";

describe("groupPermissionsByCategory", () => {
  it("groups by categoryId and sorts categories and keys", () => {
    const input: readonly PermissionCatalogEntry[] = [
      {
        key: "ticket.merge",
        description: "Merge",
        categoryId: "ticket",
      },
      {
        key: "settings.write",
        description: "Settings",
        categoryId: "settings",
      },
      {
        key: "ticket.bulk.assign",
        description: "Assign",
        categoryId: "ticket",
      },
    ];
    const actual = groupPermissionsByCategory(input);
    expect(actual.map((group) => group.categoryId)).toEqual([
      "settings",
      "ticket",
    ]);
    expect(actual[1]?.entries.map((entry) => entry.key)).toEqual([
      "ticket.bulk.assign",
      "ticket.merge",
    ]);
  });
});
