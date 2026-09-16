import { describe, expect, it } from "vitest";
import { countPolicyPackPermissions } from "@/lib/policy-packs/count-policy-pack-permissions";

describe("countPolicyPackPermissions", () => {
  it("counts unique permission keys across grants", () => {
    expect(
      countPolicyPackPermissions([
        { permissionKeys: ["a", "b"] },
        { permissionKeys: ["b", "c"] },
      ]),
    ).toBe(3);
  });
});
