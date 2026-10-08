import { describe, expect, it } from "vitest";
import { buildCatalogRoutingIndex } from "@/lib/services/catalog-routing-index";
import type { RoutingCoverageItem } from "@/services/routing-api";

function item(
  serviceId: string,
  originUnitId: string,
  hasExactRule: boolean,
  outcome: RoutingCoverageItem["resolution"]["outcome"],
): RoutingCoverageItem {
  return {
    originUnitId,
    originUnitPath: `/root/${originUnitId}`,
    serviceId,
    serviceName: serviceId,
    serviceLifecycle: "ACTIVE",
    hasExactRule,
    resolution: {
      outcome,
      originUnitId,
      serviceId,
      groupId: outcome === "UNROUTED" ? null : "group-1",
      matchedRuleId: hasExactRule ? "rule-1" : null,
      matchedOriginUnitId: hasExactRule ? originUnitId : null,
      fallbackDepth: outcome === "PARENT_FALLBACK" ? 1 : 0,
      fallbackPath: [],
    },
  };
}

describe("buildCatalogRoutingIndex", () => {
  it("lists origin units and indexes only explicit rules, not fallback coverage rows", () => {
    const index = buildCatalogRoutingIndex([
      item("service-1", "ou-child", false, "PARENT_FALLBACK"),
      item("service-1", "ou-root", true, "EXACT"),
      item("service-2", "ou-child", false, "UNROUTED"),
    ]);

    expect(index.originUnits).toEqual([
      { id: "ou-child", path: "/root/ou-child" },
      { id: "ou-root", path: "/root/ou-root" },
    ]);
    expect(index.serviceIdsWithExactRuleByOriginUnit.get("ou-child")).toBeUndefined();
    expect(index.serviceIdsWithExactRuleByOriginUnit.get("ou-root")).toEqual(
      new Set(["service-1"]),
    );
  });

  it("keeps an unrouted cell visible in the service coverage note", () => {
    const index = buildCatalogRoutingIndex([
      item("service-1", "ou-child", false, "PARENT_FALLBACK"),
      item("service-1", "ou-root", true, "EXACT"),
      item("service-1", "ou-other", false, "UNROUTED"),
    ]);

    expect(index.notesByServiceId.get("service-1")).toEqual({
      tone: "warning",
      key: "services.coverageUnrouted",
    });
  });
});
