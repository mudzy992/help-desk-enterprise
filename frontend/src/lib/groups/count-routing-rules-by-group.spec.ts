import { describe, expect, it } from "vitest";
import { countRoutingRulesByGroup } from "@/lib/groups/count-routing-rules-by-group";

describe("countRoutingRulesByGroup", () => {
  it("counts rules per groupId", () => {
    const actual = countRoutingRulesByGroup([
      { groupId: "g-a" },
      { groupId: "g-b" },
      { groupId: "g-a" },
    ]);
    expect(actual.get("g-a")).toBe(2);
    expect(actual.get("g-b")).toBe(1);
    expect(actual.get("g-missing")).toBeUndefined();
  });

  it("returns empty map for empty rules", () => {
    expect(countRoutingRulesByGroup([]).size).toBe(0);
  });
});
