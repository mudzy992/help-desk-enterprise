import { describe, expect, it } from "vitest";
import { catalogCoverageNote } from "@/lib/services/catalog-coverage-note";
import type { RoutingCoverageItem } from "@/services/routing-api";

function item(
  serviceId: string,
  outcome: "EXACT" | "UNROUTED",
): RoutingCoverageItem {
  return {
    originUnitId: "ou-1",
    originUnitPath: "/root",
    serviceId,
    serviceName: "VPN",
    hasExactRule: outcome === "EXACT",
    resolution: {
      outcome,
      originUnitId: "ou-1",
      serviceId,
      groupId: outcome === "EXACT" ? "g-1" : null,
      matchedRuleId: outcome === "EXACT" ? "r-1" : null,
      matchedOriginUnitId: outcome === "EXACT" ? "ou-1" : null,
      fallbackDepth: 0,
      fallbackPath: [],
    },
  };
}

describe("catalogCoverageNote", () => {
  it("returns null when the service has no coverage rows", () => {
    expect(catalogCoverageNote([item("other", "EXACT")], "svc")).toBeNull();
  });

  it("warns when any coverage cell is unrouted", () => {
    expect(catalogCoverageNote([item("svc", "UNROUTED")], "svc")).toEqual({
      tone: "warning",
      key: "services.coverageUnrouted",
    });
  });

  it("marks routed coverage as success", () => {
    expect(catalogCoverageNote([item("svc", "EXACT")], "svc")).toEqual({
      tone: "success",
      key: "services.coverageOk",
    });
  });
});
