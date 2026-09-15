import { describe, expect, it } from "vitest";
import type { RoutingCoverageItem } from "@/services/routing-api";
import {
  buildRoutingCoverageMatrix,
  coverageCellKind,
  coverageCellKey,
  originUnitShortName,
} from "./build-routing-coverage-matrix";

function item(partial: {
  originUnitId: string;
  originUnitPath: string;
  serviceId: string;
  serviceName: string;
  outcome: RoutingCoverageItem["resolution"]["outcome"];
}): RoutingCoverageItem {
  return {
    originUnitId: partial.originUnitId,
    originUnitPath: partial.originUnitPath,
    serviceId: partial.serviceId,
    serviceName: partial.serviceName,
    hasExactRule: partial.outcome === "EXACT",
    resolution: {
      outcome: partial.outcome,
      originUnitId: partial.originUnitId,
      serviceId: partial.serviceId,
      groupId: partial.outcome === "UNROUTED" ? null : "g-1",
      matchedRuleId: partial.outcome === "EXACT" ? "r-1" : null,
      matchedOriginUnitId: partial.outcome === "EXACT" ? partial.originUnitId : null,
      fallbackDepth: partial.outcome === "PARENT_FALLBACK" ? 1 : 0,
      fallbackPath: [partial.originUnitPath],
    },
  };
}

describe("buildRoutingCoverageMatrix", () => {
  it("pivots API order into services × origin units and counts outcomes", () => {
    const matrix = buildRoutingCoverageMatrix([
      item({
        originUnitId: "ou-it",
        originUnitPath: "/Korisnici/IT",
        serviceId: "sv-vpn",
        serviceName: "VPN",
        outcome: "EXACT",
      }),
      item({
        originUnitId: "ou-hr",
        originUnitPath: "/Korisnici/HR",
        serviceId: "sv-vpn",
        serviceName: "VPN",
        outcome: "PARENT_FALLBACK",
      }),
      item({
        originUnitId: "ou-it",
        originUnitPath: "/Korisnici/IT",
        serviceId: "sv-mail",
        serviceName: "Mail",
        outcome: "UNROUTED",
      }),
      item({
        originUnitId: "ou-hr",
        originUnitPath: "/Korisnici/HR",
        serviceId: "sv-mail",
        serviceName: "Mail",
        outcome: "UNROUTED",
      }),
    ]);

    expect(matrix.services.map((row) => row.serviceId)).toEqual([
      "sv-vpn",
      "sv-mail",
    ]);
    expect(matrix.originUnits.map((column) => column.originUnitId)).toEqual([
      "ou-it",
      "ou-hr",
    ]);
    expect(matrix.originUnits[0]?.originUnitShortName).toBe("IT");
    expect(matrix.stats).toEqual({
      exact: 1,
      inherited: 1,
      unrouted: 2,
      total: 4,
    });
    expect(
      matrix.cellByKey.get(coverageCellKey("sv-vpn", "ou-hr"))?.resolution
        .outcome,
    ).toBe("PARENT_FALLBACK");
  });

  it("maps outcomes to cell kinds and short OU labels", () => {
    expect(coverageCellKind("EXACT")).toBe("exact");
    expect(coverageCellKind("PARENT_FALLBACK")).toBe("inherited");
    expect(coverageCellKind("UNROUTED")).toBe("unrouted");
    expect(originUnitShortName("/Korisnici/Direkcija/IT")).toBe("IT");
  });
});
