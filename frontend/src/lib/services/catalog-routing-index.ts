import { catalogCoverageNote, type CatalogCoverageNote } from "@/lib/services/catalog-coverage-note";
import type { RoutingCoverageItem } from "@/services/routing-api";

export type CatalogOriginUnitOption = {
  readonly id: string;
  readonly path: string;
};

export type CatalogRoutingIndex = {
  readonly notesByServiceId: ReadonlyMap<string, CatalogCoverageNote>;
  readonly originUnits: readonly CatalogOriginUnitOption[];
  /** Service IDs with a direct routing rule at each origin unit. */
  readonly serviceIdsWithExactRuleByOriginUnit: ReadonlyMap<string, ReadonlySet<string>>;
};

/**
 * Routing coverage contains a row for every service × origin-unit pair, even
 * when the result is UNROUTED. Keep the catalogue's OU filter tied only to
 * `hasExactRule`, not to the existence of a coverage row or its fallback result.
 */
export function buildCatalogRoutingIndex(
  items: readonly RoutingCoverageItem[],
): CatalogRoutingIndex {
  const originUnits = new Map<string, CatalogOriginUnitOption>();
  const serviceItems = new Map<string, RoutingCoverageItem[]>();
  const exactServicesByOrigin = new Map<string, Set<string>>();

  for (const item of items) {
    if (!originUnits.has(item.originUnitId)) {
      originUnits.set(item.originUnitId, {
        id: item.originUnitId,
        path: item.originUnitPath,
      });
    }

    const forService = serviceItems.get(item.serviceId) ?? [];
    forService.push(item);
    serviceItems.set(item.serviceId, forService);

    if (item.hasExactRule) {
      const serviceIds = exactServicesByOrigin.get(item.originUnitId) ?? new Set<string>();
      serviceIds.add(item.serviceId);
      exactServicesByOrigin.set(item.originUnitId, serviceIds);
    }
  }

  const notesByServiceId = new Map<string, CatalogCoverageNote>();
  for (const [serviceId, forService] of serviceItems) {
    const note = catalogCoverageNote(forService, serviceId);
    if (note !== null) {
      notesByServiceId.set(serviceId, note);
    }
  }

  return {
    notesByServiceId,
    originUnits: [...originUnits.values()],
    serviceIdsWithExactRuleByOriginUnit: exactServicesByOrigin,
  };
}
