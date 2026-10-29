import {
  listRoutingCoverage,
  type RoutingCoverageItem,
  type RoutingCoveragePage,
  type RoutingCoverageQuery,
} from "@/services/routing-api";

type RoutingCoveragePageLoader = (query: RoutingCoverageQuery) => Promise<RoutingCoveragePage>;

export const catalogRoutingCoverageMaximumPages = 200;

/**
 * Load catalog coverage within an explicit 10k-item transport ceiling.
 * Repeated cursors and oversized catalogs fail closed instead of creating an
 * unbounded request chain in every open catalog tab.
 */
export async function loadCatalogRoutingCoverage(
  loadPage: RoutingCoveragePageLoader = listRoutingCoverage,
): Promise<readonly RoutingCoverageItem[]> {
  const items: RoutingCoverageItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (let pageNumber = 0; pageNumber < catalogRoutingCoverageMaximumPages; pageNumber += 1) {
    const query: RoutingCoverageQuery =
      cursor === undefined ? { includeInactive: true } : { includeInactive: true, cursor };
    const page = await loadPage(query);
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    if (seenCursors.has(page.nextCursor)) {
      throw new Error("Routing coverage cursor cycle detected");
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new Error(
    `Routing coverage exceeded the ${catalogRoutingCoverageMaximumPages}-page catalog ceiling`,
  );
}
