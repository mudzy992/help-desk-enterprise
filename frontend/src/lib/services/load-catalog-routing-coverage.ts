import {
  listRoutingCoverage,
  type RoutingCoverageItem,
  type RoutingCoveragePage,
  type RoutingCoverageQuery,
} from "@/services/routing-api";

type RoutingCoveragePageLoader = (
  query: RoutingCoverageQuery,
) => Promise<RoutingCoveragePage>;

/** Load every coverage page without overriding the API's max-safe default page size. */
export async function loadCatalogRoutingCoverage(
  loadPage: RoutingCoveragePageLoader = listRoutingCoverage,
): Promise<readonly RoutingCoverageItem[]> {
  const items: RoutingCoverageItem[] = [];
  let cursor: string | undefined;

  do {
    const query: RoutingCoverageQuery =
      cursor === undefined
        ? { includeInactive: true }
        : { includeInactive: true, cursor };
    const page = await loadPage(query);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);

  return items;
}
