import { describe, expect, it } from "vitest";
import { loadCatalogRoutingCoverage } from "@/lib/services/load-catalog-routing-coverage";
import type { RoutingCoveragePage, RoutingCoverageQuery } from "@/services/routing-api";

describe("loadCatalogRoutingCoverage", () => {
  it("uses the API default page size and follows every cursor", async () => {
    const requested: RoutingCoverageQuery[] = [];
    const pages: RoutingCoveragePage[] = [
      { items: [], total: 51, take: 50, cursor: null, nextCursor: "page-2" },
      { items: [], total: 51, take: 50, cursor: "page-2", nextCursor: null },
    ];
    const loadPage = async (query: RoutingCoverageQuery): Promise<RoutingCoveragePage> => {
      requested.push(query);
      const page = pages.shift();
      if (page === undefined) throw new Error("Unexpected extra coverage page request");
      return page;
    };

    await expect(loadCatalogRoutingCoverage(loadPage)).resolves.toEqual([]);
    expect(requested).toEqual([
      { includeInactive: true },
      { includeInactive: true, cursor: "page-2" },
    ]);
  });
});
