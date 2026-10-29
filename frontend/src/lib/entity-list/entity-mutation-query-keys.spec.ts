import { describe, expect, it } from "vitest";
import { entityMutationQueryKeys } from "@/lib/entity-list/entity-mutation-query-keys";

describe("entityMutationQueryKeys", () => {
  it("keeps record mutations away from capability and options queries", () => {
    const keys = [
      ...entityMutationQueryKeys.assets.records,
      ...entityMutationQueryKeys.problems.record("problem-1"),
      ...entityMutationQueryKeys.changes.record("change-1"),
    ];

    expect(keys).not.toContainEqual(["assets"]);
    expect(keys).not.toContainEqual(["problems"]);
    expect(keys).not.toContainEqual(["changes"]);
    expect(keys.some((key) => key.includes("capabilities"))).toBe(false);
    expect(keys.some((key) => key.includes("options"))).toBe(false);
  });

  it("separates catalogs, commercial records, transfers, and templates", () => {
    expect(entityMutationQueryKeys.assets.catalog).toContainEqual(["assets", "catalog"]);
    expect(entityMutationQueryKeys.assets.contracts).toEqual([
      ["assets", "contracts"],
      ["assets", "contract"],
    ]);
    expect(entityMutationQueryKeys.assets.licenses).toEqual([
      ["assets", "licenses"],
      ["assets", "license"],
    ]);
    expect(entityMutationQueryKeys.assets.transfers).not.toContainEqual([
      "assets",
      "transfers",
      "configuration",
    ]);
    expect(entityMutationQueryKeys.changes.templates).toEqual([["changes", "templates"]]);
  });
});
