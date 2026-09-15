import type { RoutingCoverageItem, RoutingOutcome } from "@/services/routing-api";

export type RoutingCoverageCellKind = "exact" | "inherited" | "unrouted";

export const ROUTING_COVERAGE_CELL_STYLE: Record<
  RoutingCoverageCellKind,
  string
> = {
  exact: "border-success/35 bg-success/12 text-[#4ADE80]",
  inherited: "border-info/25 bg-info/10 text-info",
  unrouted: "border-danger/30 bg-danger/8 text-danger/90",
};

export type RoutingCoverageOriginColumn = {
  readonly originUnitId: string;
  readonly originUnitPath: string;
  readonly originUnitShortName: string;
};

export type RoutingCoverageServiceRow = {
  readonly serviceId: string;
  readonly serviceName: string;
};

export type RoutingCoverageMatrixStats = {
  readonly exact: number;
  readonly inherited: number;
  readonly unrouted: number;
  readonly total: number;
};

export type RoutingCoverageMatrix = {
  readonly services: readonly RoutingCoverageServiceRow[];
  readonly originUnits: readonly RoutingCoverageOriginColumn[];
  readonly cellByKey: ReadonlyMap<string, RoutingCoverageItem>;
  readonly stats: RoutingCoverageMatrixStats;
};

export function coverageCellKey(
  serviceId: string,
  originUnitId: string,
): string {
  return `${serviceId}:${originUnitId}`;
}

export function coverageCellKind(
  outcome: RoutingOutcome,
): RoutingCoverageCellKind {
  if (outcome === "EXACT") {
    return "exact";
  }
  if (outcome === "PARENT_FALLBACK") {
    return "inherited";
  }
  return "unrouted";
}

export function originUnitShortName(originUnitPath: string): string {
  const segments = originUnitPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? originUnitPath;
}

export function markKeyForKind(
  kind: RoutingCoverageCellKind,
): "routing.markExact" | "routing.markFallback" | "routing.markUnrouted" {
  if (kind === "exact") {
    return "routing.markExact";
  }
  if (kind === "inherited") {
    return "routing.markFallback";
  }
  return "routing.markUnrouted";
}

export function outcomeLabelKeyForKind(
  kind: RoutingCoverageCellKind,
):
  | "routing.outcomeExact"
  | "routing.outcomeInherited"
  | "routing.outcomeUnrouted" {
  if (kind === "exact") {
    return "routing.outcomeExact";
  }
  if (kind === "inherited") {
    return "routing.outcomeInherited";
  }
  return "routing.outcomeUnrouted";
}

export function buildRoutingCoverageMatrix(
  items: readonly RoutingCoverageItem[],
): RoutingCoverageMatrix {
  const services: RoutingCoverageServiceRow[] = [];
  const originUnits: RoutingCoverageOriginColumn[] = [];
  const seenServices = new Set<string>();
  const seenOrigins = new Set<string>();
  const cellByKey = new Map<string, RoutingCoverageItem>();
  let exact = 0;
  let inherited = 0;
  let unrouted = 0;

  for (const item of items) {
    cellByKey.set(coverageCellKey(item.serviceId, item.originUnitId), item);
    if (!seenServices.has(item.serviceId)) {
      seenServices.add(item.serviceId);
      services.push({
        serviceId: item.serviceId,
        serviceName: item.serviceName,
      });
    }
    if (!seenOrigins.has(item.originUnitId)) {
      seenOrigins.add(item.originUnitId);
      originUnits.push({
        originUnitId: item.originUnitId,
        originUnitPath: item.originUnitPath,
        originUnitShortName: originUnitShortName(item.originUnitPath),
      });
    }
    const kind = coverageCellKind(item.resolution.outcome);
    if (kind === "exact") {
      exact += 1;
    } else if (kind === "inherited") {
      inherited += 1;
    } else {
      unrouted += 1;
    }
  }

  return {
    services,
    originUnits,
    cellByKey,
    stats: { exact, inherited, unrouted, total: items.length },
  };
}
